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

  const tests: Test[] = sortedSteps
    .filter(a => a.event === "test:start")
    .map(step => ({
      title: step.test[step.test.length - 1] || step.file,
      path: [],
      result: "passed",
      relativePath: step.file,
      relativeStartTime: toRelativeTime(step.timestamp, firstTimestamp),
      steps: [],
    }));

  const stepStack: StepStackItem[] = [];

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
    assertCurrentTest(currentTest);

    switch (step.event) {
      case "step:enqueue":
        // ignore for now ...
        break;
      case "step:start":
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
          category: step.category || "other",
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
        currentTest.duration =
          toRelativeTime(step.timestamp, firstTimestamp) - currentTest.relativeStartTime!;
        break;
    }
  }

  return tests;
}

export { groupStepsByTest };
