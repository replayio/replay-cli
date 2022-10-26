/// <reference types="cypress" />

import { Test, TestStep } from "@replayio/test-utils";
import type { StepEvent } from "./support";

function toTime(timestamp: string) {
  return new Date(timestamp).getTime();
}

function toRelativeTime(timestamp: string, startTime: number) {
  return toTime(timestamp) - startTime;
}

function assertCurrentTest(
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

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];

    let currentTest = tests.at(tests.length - 1);

    switch (step.event) {
      case "test:start":
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
        assertCurrentTest(currentTest, step);
        // ignore for now ...
        break;
      case "step:start":
        assertCurrentTest(currentTest, step);
        const testStep = {
          name: step.command!.name,
          args: step.command!.args,
          relativeStartTime:
            toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!,
        };
        currentTest.steps!.push(testStep);
        stepStack.push({ event: step, step: testStep });
        break;
      case "step:end":
        const lastStep = stepStack.pop();
        assertCurrentTest(currentTest, step);
        assertMatchingStep(step, lastStep?.event);

        const currentTestStep = lastStep.step!;
        currentTestStep!.duration =
          toRelativeTime(step.timestamp, firstTimestamp) -
          currentTestStep!.relativeStartTime! -
          currentTest.relativeStartTime!;

        if (step.error) {
          currentTestStep!.error = step.error;
        }
        break;
      case "test:end":
        assertCurrentTest(currentTest, step);

        currentTest.duration =
          toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
        break;
    }
  }

  return tests;
}

export { groupStepsByTest };
