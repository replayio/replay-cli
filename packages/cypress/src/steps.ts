/// <reference types="cypress" />

import { Test, TestStep } from "@replayio/test-utils";
import type { StepEvent } from "./support";

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
  if (!currentTest || currentTest.title !== step.test[step.test.length - 1]) {
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
  const stepStack: { event: StepEvent; step: TestStep }[] = [];
  const assertStack: { event: StepEvent; step: TestStep }[] = [];

  // steps are grouped by `chainerId` and then assigned a parent here by
  // tracking the most recent groupId
  let activeGroup: { groupId: string; parentId: string } | undefined;

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];

    let currentTest = tests.at(tests.length - 1);

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
        };
        currentTest.steps!.push(testStep);

        if (testStep.name === "assert") {
          assertStack.push({ event: step, step: testStep });
        } else {
          stepStack.push({ event: step, step: testStep });
        }
        break;
      case "step:end":
        assertCurrentTest(currentTest);
        const isAssert = step.command!.name === "assert";
        let lastStep;
        if (isAssert) {
          // It's not guaranteed that asserts are pushed/popped in order, so we use a find here instead.
          lastStep = assertStack.find(a => a.step.id === step.command!.id);
        } else {
          lastStep = stepStack.pop();
          assertCurrentTestMatch(currentTest, step);
        }

        assertMatchingStep(step, lastStep?.event);

        const currentTestStep = lastStep!.step!;
        currentTestStep!.duration =
          toRelativeTime(step.timestamp, firstTimestamp) -
          currentTestStep!.relativeStartTime! -
          currentTest.relativeStartTime!;

        if (step.error) {
          currentTestStep!.error = step.error;
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
