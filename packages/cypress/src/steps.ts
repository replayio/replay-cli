/// <reference types="cypress" />

import { Hook, ReporterError, Test, TestStep } from "@replayio/test-utils";
import type debug from "debug";
import { AFTER_EACH_HOOK } from "./constants";
import type { StepEvent } from "./support";

interface StepStackItem {
  event: StepEvent;
  step: TestStep;
}

function isGlobalHook(testStep: TestStep) {
  return testStep.hook === "beforeAll" || testStep.hook === "afterAll";
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

function assertCurrentTest(
  currentTest: Test | undefined,
  step: StepEvent
): asserts currentTest is Test {
  if (!currentTest) {
    throw new ReporterError(step.test.join(" > "), "currentTest does not exist");
  }
}

function assertMatchingStep(
  currentStep: StepEvent,
  previousStep: StepEvent | undefined
): asserts previousStep is StepEvent {
  if (
    !currentStep ||
    !previousStep ||
    !currentStep.command ||
    !previousStep.command ||
    currentStep.command.id !== previousStep.command.id
  ) {
    throw new ReporterError(
      currentStep?.test.join(" > "),
      "Mismatched step event: " + JSON.stringify(currentStep) + JSON.stringify(previousStep)
    );
  }
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

function groupStepsByTest(
  spec: Cypress.Spec,
  resultTests: CypressCommandLine.TestResult[],
  steps: StepEvent[],
  firstTimestamp: number,
  debug: debug.Debugger
): { hooks: Hook[]; tests: Test[] } {
  debug = debug.extend("group");
  if (steps.length === 0) {
    debug("No test steps found");
    return { hooks: [], tests: [] };
  }

  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => {
    const tsCompare = a.timestamp.localeCompare(b.timestamp);
    if (tsCompare === 0) {
      return toEventOrder(a) - toEventOrder(b);
    }

    return tsCompare;
  });

  const testStartEvents = sortedSteps.filter(a => a.event === "test:start");
  const tests = resultTests.map<Test>(result => {
    const step = testStartEvents.find(e => e.test.join(",") === result.title.join(","));

    return {
      title: result.title[result.title.length - 1],
      path: result.title,
      result: mapStateToResult(result.state),
      relativePath: spec.relative,
      relativeStartTime: step ? toRelativeTime(step.timestamp, firstTimestamp) : 0,
      steps: [],
    };
  });
  const hooks: Hook[] = [];

  debug("Found %d tests", tests.length);
  debug(
    "%O",
    tests.map(t => t.title)
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
      t => t.title === step.test[step.test.length - 1]
    );
    if (currentTest !== testForStep) {
      activeGroup = undefined;
    }
    currentTest = testForStep;

    debug("Processing %s event: %o", step.event, step);

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
        const args = step.command?.args?.map(a => (a && typeof a === "object" ? {} : a)) || [];

        const testStep: TestStep = {
          id: step.command!.id,
          path: step.test,
          parentId,
          name: step.command!.name,
          args: args,
          commandId: step.command!.commandId,
          category: step.category || "other",
          hook: step.hook,
        };

        if (isGlobalHook(testStep)) {
          let hook = hooks.find(h => h.title === testStep.hook);
          if (!hook) {
            hook = {
              title: testStep.hook!,
              path: testStep.path,
              steps: [],
            };
            hooks.push(hook);
          }

          hook.steps!.push(testStep);
        } else {
          assertCurrentTest(currentTest, step);

          testStep.relativeStartTime =
            toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;

          // If this assertion has an associated commandId, find that step by
          // command and add this command to its assertIds array
          if (step.command!.commandId) {
            const commandStep = currentTest.steps!.find(s => s.id === step.command!.commandId);
            if (commandStep) {
              commandStep.assertIds = commandStep?.assertIds || [];
              commandStep.assertIds.push(testStep.id);
            }
          }

          currentTest.steps!.push(testStep);
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
          lastStep.step.args = step.command.args;
        }

        const currentTestStep = lastStep.step!;
        if (!isGlobalHook(currentTestStep)) {
          assertCurrentTest(currentTest, step);

          const relativeEndTime =
            toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
          currentTestStep.duration = Math.max(
            0,
            relativeEndTime - currentTestStep.relativeStartTime!
          );
        }

        // Always set the error so that a successful retry will clear a previous error
        currentTestStep.error = step.error;
        break;
      case "test:end":
        assertCurrentTest(currentTest, step);
        currentTest.duration =
          toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
        break;
    }
  }

  return { hooks, tests };
}

export { groupStepsByTest };
