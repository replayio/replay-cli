import { Test } from "@replayio/test-utils";
import type { StepEvent } from "./support";

export enum Errors {
  NoTestResults = 101,
  MismatchedStep = 201,
  TestMissing = 202,
}

export class StepAssertionError extends Error {
  name = "StepAssertionError";
  message: string;
  step: StepEvent;
  code: number;

  constructor(step: StepEvent, code: number, message: string) {
    super();
    this.step = step;
    this.code = code;
    this.message = message;
  }
}

export function isStepAssertionError(e: any): e is StepAssertionError {
  return e instanceof Error && e.name === "StepAssertionError";
}

export function assertCurrentTest(
  currentTest: Test | undefined,
  step: StepEvent
): asserts currentTest is Test {
  if (!currentTest) {
    throw new StepAssertionError(step, Errors.TestMissing, "currentTest does not exist");
  }
}

export function assertMatchingStep(
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
    throw new StepAssertionError(currentStep, Errors.MismatchedStep, "Mismatched step event");
  }
}
