/// <reference types="cypress" />

import { ReporterError, TestMetadataV2 } from "@replayio/test-utils";
import { AFTER_EACH_HOOK } from "./constants";
import { Errors, assertCurrentTest, assertMatchingStep, isStepAssertionError } from "./error";
import type { StepEvent } from "./support";
import { logger } from "@replay-cli/shared/logger";

type Test = TestMetadataV2.Test;
type UserActionEvent = TestMetadataV2.UserActionEvent;

interface StepStackItem {
  event: StepEvent;
  step: UserActionEvent;
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

function toEventOrder(event: StepEvent) {
  return ["test:start", "step:enqueue", "step:start", "step:end", "test:end"].indexOf(event.event);
}

function shouldSkipStep(step: StepEvent, skippedSteps: string[]) {
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
    logger.info("ShouldSkipStep:TestStepSkipped", { id: step.command?.id, reason });
    return true;
  }

  return false;
}

function simplifyArgs(args?: any[]) {
  return args?.filter(a => !!a && typeof a !== "object").map(a => String(a)) || [];
}

function getTestsFromResults(
  spec: Cypress.Spec,
  resultTests: CypressCommandLine.TestResult[],
  testStartSteps: StepEvent[]
) {
  const startEvents = sortSteps(testStartSteps);

  function getStartTestStep(result: CypressCommandLine.TestResult) {
    const startEventIndex = startEvents.findIndex(
      e => e.test.every((t, i) => t === result.title[i]) && e.test.length === result.title.length
    );
    if (startEventIndex !== -1) {
      const startEvent = startEvents.splice(startEventIndex, 1)[0];
      return startEvent;
    }
  }

  const tests = resultTests.flatMap<Test>((result, id) => {
    const scope = [...result.title];
    const title = scope.pop()!;
    const lastAttemptIndex = result.attempts.length - 1;

    return result.attempts.map<Test>((a, attemptIndex) => {
      const startTestStep = getStartTestStep(result);
      const attempt = attemptIndex + 1;
      return {
        id: startTestStep?.testId ?? attemptIndex,
        executionGroupId: "single",
        executionId: [spec.relative, attempt, ...scope, title].join("-"),
        // those properties don't exist since Cypress 13: https://github.com/cypress-io/cypress/pull/27230
        // TODO: remove it in PRO-640
        approximateDuration: (a as any).duration || (a as any).wallClockDuration || 0,
        attempt,
        maxAttempts: startTestStep?.maxAttempts ?? 1,
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
        // attempt.error is available here:
        // https://github.com/cypress-io/cypress/blob/61156808413be8b99264026323ce3abfb22c4c26/packages/server/lib/modes/results.ts#L20
        // but it's lost when creating a public test result:
        // https://github.com/cypress-io/cypress/blob/61156808413be8b99264026323ce3abfb22c4c26/packages/server/lib/modes/results.ts#L111
        // `.displayError` represents the error reported by the last attempt
        // for all of the previous attempts we rely on the search for the last errored step in `groupStepsByTest`
        // if an error is found there, it will be set on the test, the information set here is not overriden though
        error:
          attemptIndex === lastAttemptIndex && result.displayError
            ? {
                name: "DisplayError",
                message: result.displayError,
              }
            : null,
      };
    });
  });

  logger.info("GetTestsFromResults:TestsFound", {
    count: tests.length,
    titles: tests.map(t => t.source.title),
  });

  return tests;
}

function sortSteps(steps: StepEvent[]) {
  // The steps can come in out of order but are sortable by timestamp
  return [...steps].sort((a, b) => a.index - b.index);
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

    logger.info("GroupStepsByTest:StepProcessing", { event: step.event, step });

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
          currentTest.events[step.hook || "main"].push(testStep);
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
            logger.info("ShouldSkipStep:AfterEachNotSupported");
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

  tests.forEach(test => {
    // If a test fails in the beforeAll hook phase, Cypress will mark the first
    // test as failed and the rest as unknown. For consistency, try to detect this
    // first case and set it to unknown as well.
    if (test.result === "failed" && test.events.main.length === 0) {
      if (!steps.some(s => s.event === "test:start" && isTestForStep(test, s))) {
        test.result = "unknown";
      }
    }

    // Cypress doesn't always bubble up step errors to the test so if a test
    // failed and it is missing an error, we find the last error and set that on
    // the test
    if (test.result === "failed" && test.error == null) {
      const phases: (keyof Test["events"])[] = [
        "afterAll",
        "afterEach",
        "main",
        "beforeEach",
        "beforeAll",
      ];
      for (const phase of phases) {
        const stepWithError = test.events[phase].findLast(step => !!step.data.error);
        if (stepWithError) {
          test.error = stepWithError.data.error;
          break;
        }
      }
    }
  });

  return tests;
}

export { getTestsFromResults, groupStepsByTest, sortSteps };
