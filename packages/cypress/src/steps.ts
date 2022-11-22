/// <reference types="cypress" />

import { Test, TestStep } from "@replayio/test-utils";
import { AFTER_EACH_HOOK } from "./constants";
import type { StepEvent } from "./support";

interface StepStackItem {
  event: StepEvent;
  step: TestStep;
}

function toTime(timestamp: string) {
  return new Date(timestamp).getTime();
}

function toRelativeTime(timestamp: string, startTime: number) {
  return toTime(timestamp) - startTime;
}

function assertCurrentTest(currentTest: Test | undefined): asserts currentTest is Test {
  if (!currentTest) {
    throw new Error("currentTest does not exist");
  }
}

function assertCurrentTestMatch(
  currentTest: Test | undefined,
  step: StepEvent
): asserts currentTest is Test {
  if (
    !currentTest ||
    (step.test[0] !== AFTER_EACH_HOOK && currentTest.title !== step.test[step.test.length - 1])
  ) {
    throw new Error("test:start event not received for " + step.test.join(" > "));
  }
}

function assertMatchingStep(
  currentStep: StepEvent | undefined,
  previousStep: StepEvent | undefined
): asserts previousStep is StepEvent {
  if (
    !currentStep ||
    !previousStep ||
    !currentStep.command ||
    !previousStep.command ||
    currentStep.command.id !== previousStep.command.id
  ) {
    throw new Error(
      "Mismatched step event: " + JSON.stringify(currentStep) + JSON.stringify(previousStep)
    );
  }
}

function groupStepsByTest(steps: StepEvent[], firstTimestamp: number): Test[] {
  if (steps.length === 0) {
    return [];
  }

  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const tests: Test[] = [];
  const stepStack: StepStackItem[] = [];

  // steps are grouped by `chainerId` and then assigned a parent here by
  // tracking the most recent groupId
  let activeGroup: { groupId: string; parentId: string } | undefined;

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];

    let currentTest: Test | undefined = tests[tests.length - 1];

    switch (step.event) {
      case "test:start":
        activeGroup = undefined;
        currentTest = {
          title: step.test[step.test.length - 1] || step.file,
          path: [],
          result: "passed",
          relativePath: step.file,
          relativeStartTime: toRelativeTime(step.timestamp, firstTimestamp),
          steps: [],
        };

        tests.push(currentTest);
        break;
      case "step:enqueue":
        assertCurrentTestMatch(currentTest, step);
        // ignore for now ...
        break;
      case "step:start":
        assertCurrentTestMatch(currentTest, step);
        let parentId: string | undefined;

        if (activeGroup && activeGroup.groupId === step.command?.groupId) {
          parentId = activeGroup.parentId;
        } else if (step.command?.groupId) {
          activeGroup = { groupId: step.command.groupId, parentId: step.command.id };
        }

        const testStep = {
          id: step.command!.id,
          parentId,
          name: step.command!.name,
          args: step.command!.args,
          relativeStartTime:
            toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!,
          category: step.category,
          hook: step.hook,
        };
        currentTest.steps!.push(testStep);
        stepStack.push({ event: step, step: testStep });
        break;
      case "step:end":
        assertCurrentTest(currentTest);
        const isAssert = step.command!.name === "assert";
        const lastStep: StepStackItem | undefined = stepStack.find(
          a => a.step.id === step.command!.id && a.event.test.toString() === step.test.toString()
        );

        // TODO [ryanjduffy]: Skipping handling after each events for now
        if (step.test[0] === AFTER_EACH_HOOK) {
          continue;
        }

        assertCurrentTestMatch(currentTest, step);
        assertMatchingStep(step, lastStep?.event);

        // asserts can change the args if the message changes
        if (isAssert && step.command) {
          lastStep.step.args = step.command.args;
        }

        const currentTestStep = lastStep.step!;
        const relativeEndTime =
          toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
        currentTestStep.duration = Math.max(
          0,
          relativeEndTime - currentTestStep.relativeStartTime!
        );

        if (step.error) {
          currentTestStep.error = step.error;
        }
        break;
      case "test:end":
        assertCurrentTestMatch(currentTest, step);

        currentTest.duration =
          toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
        break;
    }
  }

  return tests;
}

export { groupStepsByTest };
