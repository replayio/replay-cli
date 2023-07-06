/// <reference types="cypress" />

import { ReporterError, TestMetadataV2 } from "@replayio/test-utils";
import Debug from "debug";
import { AFTER_EACH_HOOK } from "./constants";
import type { StepEvent } from "./support";
import { Errors, assertCurrentTest, assertMatchingStep, isStepAssertionError } from "./error";

type Test = TestMetadataV2.Test;
type UserActionEvent = TestMetadataV2.UserActionEvent;

interface StepStackItem {
  event: StepEvent;
  step: UserActionEvent;
}

const debug = Debug("replay:cypress:plugin:reporter:steps");

export function mapStateToResult(state: CypressCommandLine.TestResult["state"]): Test["result"] {
  switch (state) {
    case "failed":
    case "passed":
      return state;
    case "pending":
      return "skipped";
  }

  return "unknown";
}

function toEventOrder(event: StepEvent) {
  return ["test:start", "step:enqueue", "step:start", "step:end", "test:end"].indexOf(event.event);
}

function shouldSkipStep(step: StepEvent, skippedSteps: string[]) {
  const skipDebug = debug.extend("skip");
  const lastArg = step.command?.args?.[step.command.args.length - 1];

  let reason: string | undefined;
  if (lastArg != null && typeof lastArg === "object" && lastArg.log === false) {
    reason = "Command logging disabled";
  } else if (skippedSteps.includes(step.command?.id as any)) {
    reason = "Prior step event already skipped";
  } else if (skippedSteps.includes(step.command?.groupId as any)) {
    reason = "Parent skipped";
  }

  if (reason) {
    skipDebug("Test step %s skipped: %s", step.command?.id || "", reason);
    return true;
  }

  return false;
}

function simplifyArgs(args?: any[]) {
  return args?.map(a => String(a && typeof a === "object" ? {} : a)) || [];
}

function getTestsFromResults(resultTests: CypressCommandLine.TestResult[]) {
  const tests = resultTests.flatMap<Test>((result, id) => {
    const scope = [...result.title];
    const title = scope.pop()!;

    return result.attempts.map((a, attemptIndex) => ({
      id,
      // Cypress 10.9 types are wrong here ... duration doesn't exist but wallClockDuration does
      approximateDuration: a.duration || (a as any).wallClockDuration || 0,
      attempt: attemptIndex + 1,
      source: {
        title,
        scope,
      },
      result: mapStateToResult(a.state),
      events: {
        beforeAll: [],
        afterAll: [],
        beforeEach: [],
        afterEach: [],
        main: [],
      },
      error: result.displayError
        ? {
            name: "DisplayError",
            message: result.displayError.substring(0, result.displayError.indexOf("\n")),
          }
        : null,
    }));
  });

  debug("Found %d tests", tests.length);
  debug(
    "%O",
    tests.map(t => t.source.title)
  );

  return tests;
}

function sortSteps(steps: StepEvent[]) {
  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => {
    const tsCompare = a.timestamp.localeCompare(b.timestamp);
    if (tsCompare === 0) {
      return toEventOrder(a) - toEventOrder(b);
    }

    return tsCompare;
  });

  return sortedSteps;
}

function isTestForStep(test: Test, step: StepEvent) {
  return test.id === step.testId && test.attempt === step.attempt;
}

function groupStepsByTest(tests: Test[], steps: StepEvent[]): Test[] {
  const hooks = {
    afterAll: [] as UserActionEvent[],
    beforeAll: [] as UserActionEvent[],
  };

  const stepStack: StepStackItem[] = [];
  const skippedStepIds: string[] = [];

  // steps are grouped by `chainerId` and then assigned a parent here by
  // tracking the most recent groupId
  let activeGroup: { groupId: string; parentId: string } | undefined;
  let currentTest: Test | undefined;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const testForStep: Test | undefined = tests.find(t => isTestForStep(t, step));
    if (currentTest !== testForStep) {
      activeGroup = undefined;
    }
    currentTest = testForStep;

    debug("Processing %s event: %o", step.event, step);

    try {
      switch (step.event) {
        case "step:enqueue":
          // ignore for now ...
          break;
        case "step:start":
          let parentId: string | undefined;

          if (shouldSkipStep(step, skippedStepIds)) {
            if (step.command?.id) {
              skippedStepIds.push(step.command.id);
            }

            if (step.command?.groupId) {
              skippedStepIds.push(step.command.groupId);
            }
            break;
          }

          if (activeGroup && activeGroup.groupId === step.command?.groupId) {
            parentId = activeGroup.parentId;
          } else if (step.command?.groupId) {
            activeGroup = { groupId: step.command.groupId, parentId: step.command.id };
          }

          // Simplify args to avoid sending large objects in metadata that we
          // won't render in the UI anyway
          const args = simplifyArgs(step.command?.args);

          const testStep: UserActionEvent = {
            data: {
              id: step.command!.id,
              parentId: parentId || null,
              category: step.category || "other",
              command: {
                name: step.command!.name,
                arguments: args,
              },
              scope: step.test.slice(0, -1),
              error: null,
            },
          };

          stepStack.push({ event: step, step: testStep });

          // accumulate beforeAll/afterAll commands so they can be distributed
          // to all tests later
          if (step.hook && (step.hook === "beforeAll" || step.hook === "afterAll")) {
            hooks[step.hook].push(testStep);
            continue;
          }

          assertCurrentTest(currentTest, step);
          currentTest.events.main.push(testStep);
          break;
        case "step:end":
          const isAssert = step.command!.name === "assert";
          const lastStep: StepStackItem | undefined = stepStack.find(
            a =>
              a.step.data.id === step.command!.id &&
              a.event.test.toString() === step.test.toString()
          );

          if (!lastStep && skippedStepIds.includes(step.command?.id as any)) {
            // ignore step:ends for skipped steps
            break;
          }

          // TODO [ryanjduffy]: Skipping handling after each events for now
          if (step.test[0] === AFTER_EACH_HOOK) {
            debug("After each hooks are not currently supported");
            continue;
          }

          assertMatchingStep(step, lastStep?.event);

          // asserts can change the args if the message changes
          if (isAssert && step.command) {
            lastStep.step.data.command.arguments = simplifyArgs(step.command.args);
          }

          // Always set the error so that a successful retry will clear a previous error
          const currentTestStep = lastStep.step!;
          currentTestStep.data.error = step.error || null;
          break;
        case "test:end":
          assertCurrentTest(currentTest, step);
          break;
      }
    } catch (e) {
      if (isStepAssertionError(e)) {
        throw new ReporterError(e.code, e.message, e.step);
      } else {
        throw new ReporterError(Errors.UnexpectedError, "Unexpected step processing error", e);
      }
    }
  }

  // Distribute beforeAll/afterAll hook commands to each test
  const hookNames = Object.keys(hooks) as any as (keyof typeof hooks)[];
  hookNames.forEach(hookName => {
    const hookActions = hooks[hookName];
    hookActions.forEach(action => {
      tests.forEach(test => {
        if (action.data.scope!.every((scope, i) => scope === test.source.scope[i])) {
          test.events[hookName].push(action);
        }
      });
    });
  });

  // If a test fails in the beforeAll hook phase, Cypress will mark the first
  // test as failed and the rest as unknown. For consistency, try to detect this
  // first case and set it to unknown as well.
  tests.forEach(t => {
    if (t.result === "failed" && t.events.main.length === 0) {
      if (!steps.some(s => s.event === "test:start" && isTestForStep(t, s))) {
        t.result = "unknown";
      }
    }
  });

  return tests;
}

export { groupStepsByTest, getTestsFromResults, sortSteps };
