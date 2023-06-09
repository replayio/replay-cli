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

function toTime(timestamp: string) {
  return new Date(timestamp).getTime();
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

function getTestsFromSteps(resultTests: CypressCommandLine.TestResult[], steps: StepEvent[]) {
  if (steps.length === 0) {
    debug("No test steps found");
    return [];
  }

  const tests = resultTests.map<Test>(result => {
    const scope = [...result.title];
    const title = scope.pop()!;

    return {
      // Cypress 10.9 types are wrong here ... duration doesn't exist but wallClockDuration does
      approximateDuration: result.attempts.reduce(
        (acc, v: any) => acc + (v.duration || v.wallClockDuration || 0),
        0
      ),
      source: {
        title,
        scope,
      },
      result: mapStateToResult(result.state),
      events: {
        beforeAll: [],
        afterAll: [],
        beforeEach: [],
        afterEach: [],
        main: [],
      },
      error: null,
    };
  });

  debug("Found %d tests", tests.length);
  debug(
    "%O",
    tests.map(t => t.source.title)
  );

  return tests;
}

function groupStepsByTest(tests: Test[], steps: StepEvent[]): Test[] {
  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => {
    const tsCompare = a.timestamp.localeCompare(b.timestamp);
    if (tsCompare === 0) {
      return toEventOrder(a) - toEventOrder(b);
    }

    return tsCompare;
  });

  const hooks = {
    afterAll: [] as UserActionEvent[],
    afterEach: [] as UserActionEvent[],
    beforeAll: [] as UserActionEvent[],
    beforeEach: [] as UserActionEvent[],
  };

  const stepStack: StepStackItem[] = [];
  const skippedStepIds: string[] = [];

  // steps are grouped by `chainerId` and then assigned a parent here by
  // tracking the most recent groupId
  let activeGroup: { groupId: string; parentId: string } | undefined;
  let currentTest: Test | undefined;

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];

    let testForStep: Test | undefined = tests.find(
      t => t.source.title === step.test[step.test.length - 1]
    );
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
              scope: null,
              error: null,
            },
          };

          if (step.hook) {
            let hook = hooks[step.hook];

            if (!hook) {
              throw new ReporterError(Errors.UnexpectedError, "Unexpected hook name", step.hook);
            }

            testStep.data.scope = step.test;
            hook.push(testStep);
          } else {
            assertCurrentTest(currentTest, step);

            currentTest.events.main.push(testStep);
          }
          stepStack.push({ event: step, step: testStep });
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

  const hookNames = Object.keys(hooks) as any as (keyof typeof hooks)[];
  hookNames.forEach(hookName => {
    const hookActions = hooks[hookName];
    hookActions.forEach(action => {
      tests.forEach(test => {
        // beforeEach/afterEach hooks have a scope matching the describe tree plus the test title
        // so we pop the title off and test that first while cloning the action with a new scope
        // limited to the parent context so all hooks are consistently scoped when uploaded
        if (hookName === "beforeEach" || hookName === "afterEach") {
          const scope = [...action.data.scope!];
          const title = scope.pop();
          if (title != test.source.title) {
            return;
          }

          action.data = {
            ...action.data,
            scope,
          };
        }

        if (action.data.scope!.every((scope, i) => scope === test.source.scope[i])) {
          test.events[hookName].push(action);
        }
      });
    });
  });

  return tests;
}

export { groupStepsByTest, getTestsFromSteps };
