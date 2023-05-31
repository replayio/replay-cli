/// <reference types="cypress" />

import { ReporterError, Test, TestAction, ScopedTestAction } from "@replayio/test-utils";
import type debug from "debug";
import { AFTER_EACH_HOOK } from "./constants";
import type { StepEvent } from "./support";
import { assertCurrentTest, assertMatchingStep, isStepAssertionError } from "./error";

interface StepStackItem {
  event: StepEvent;
  step: TestAction;
}

function isGlobalHook(hook?: string): hook is "beforeAll" | "afterAll" {
  return hook === "beforeAll" || hook === "afterAll";
}

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

function toRelativeTime(timestamp: string, startTime: number) {
  return toTime(timestamp) - startTime;
}

function toEventOrder(event: StepEvent) {
  return ["test:start", "step:enqueue", "step:start", "step:end", "test:end"].indexOf(event.event);
}

function shouldSkipStep(step: StepEvent, skippedSteps: string[], debug: debug.Debugger) {
  debug = debug.extend("skip");
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
    debug("Test step %s skipped: %s", step.command?.id || "", reason);
    return true;
  }

  return false;
}

function simplifyArgs(args?: any[]) {
  return args?.map(a => String(a && typeof a === "object" ? {} : a)) || [];
}

function groupStepsByTest(
  spec: Cypress.Spec,
  resultTests: CypressCommandLine.TestResult[],
  steps: StepEvent[],
  firstTimestamp: number,
  debug: debug.Debugger
): Test[] {
  debug = debug.extend("group");
  if (steps.length === 0) {
    debug("No test steps found");
    return [];
  }

  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => {
    const tsCompare = a.timestamp.localeCompare(b.timestamp);
    if (tsCompare === 0) {
      return toEventOrder(a) - toEventOrder(b);
    }

    return tsCompare;
  });

  const tests = resultTests.map<Test>(result => {
    const scope = [...result.title];
    const title = scope.pop()!;

    return {
      source: {
        title,
        scope,
      },
      result: mapStateToResult(result.state),
      actions: {
        beforeAll: [],
        afterAll: [],
        beforeEach: [],
        afterEach: [],
        main: [],
      },
    };
  });
  const hooks: Record<string, ScopedTestAction[]> = {};

  debug("Found %d tests", tests.length);
  debug(
    "%O",
    tests.map(t => t.source.title)
  );

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

          if (shouldSkipStep(step, skippedStepIds, debug)) {
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

          const testStep: TestAction = {
            id: step.command!.id,
            parentId,
            category: step.category || "other",
            command: {
              name: step.command!.name,
              arguments: args,
            },
          };

          if (isGlobalHook(step.hook)) {
            let hook = hooks[step.hook];

            hook.push({ ...testStep, scope: step.test });
          } else {
            assertCurrentTest(currentTest, step);

            // If this assertion has an associated commandId, find that step by
            // command and add this command to its assertIds array
            // if (step.command!.commandId) {
            //   const commandStep = currentTest.steps!.find(s => s.id === step.command!.commandId);
            //   if (commandStep) {
            //     commandStep.assertIds = commandStep?.assertIds || [];
            //     commandStep.assertIds.push(testStep.id);
            //   }
            // }

            currentTest.actions.main.push(testStep);
          }
          stepStack.push({ event: step, step: testStep });
          break;
        case "step:end":
          const isAssert = step.command!.name === "assert";
          const lastStep: StepStackItem | undefined = stepStack.find(
            a => a.step.id === step.command!.id && a.event.test.toString() === step.test.toString()
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
            lastStep.step.command.arguments = simplifyArgs(step.command.args);
          }

          // Always set the error so that a successful retry will clear a previous error
          const currentTestStep = lastStep.step!;
          currentTestStep.error = step.error;
          break;
        case "test:end":
          assertCurrentTest(currentTest, step);
          break;
      }
    } catch (e) {
      if (isStepAssertionError(e)) {
        throw new ReporterError(
          e.code,
          e.message,
          currentTest
            ? [...currentTest.source.scope, currentTest.source.title].join("-")
            : spec.relative,
          e.step
        );
      } else {
        throw e;
      }
    }
  }

  return tests;
}

export { groupStepsByTest };
