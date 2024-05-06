import { Browser, TestInfo, TestInfoError, test } from "@playwright/test";
import { ReporterError, warn } from "@replayio/test-utils";
import assert from "assert";
import dbg from "debug";
import WebSocket from "ws";
import { Errors } from "./error";
import {
  ClientInstrumentation,
  ClientInstrumentationListener,
  StackFrame,
  TestInfoInternal,
  TestStepInternal,
} from "./playwrightTypes";
import { getServerPort } from "./server";

function isErrorWithCode<T extends string>(error: unknown, code: T): error is { code: T } {
  return !!error && typeof error === "object" && "code" in error && typeof error.code === code;
}

interface StepStartDetail {
  apiName: string;
  category: TestStepInternal["category"];
  frames: StackFrame[];
  params: Record<string, any>;
  title: TestStepInternal["title"];
}

export interface FixtureStepStart extends StepStartDetail {
  id: string;
}

export interface TestIdData {
  id: number;
  attempt: number;
  source: {
    title: string;
    scope: string[];
  };
}

interface FixtureStepStartEvent extends FixtureStepStart {
  event: "step:start";
  test: TestIdData;
}

interface StepEndDetail {
  error: ParsedErrorFrame | null;
}

export interface FixtureStepEnd extends StepEndDetail {
  id: string;
}

interface FixtureStepEndEvent extends FixtureStepEnd {
  event: "step:end";
  test: TestIdData;
}

interface ReporterErrorEvent extends ReporterError {
  event: "error";
  test: TestIdData;
}

export type FixtureEvent = FixtureStepStartEvent | FixtureStepEndEvent | ReporterErrorEvent;

const debug = dbg("replay:playwright:fixture");

function ReplayAddAnnotation([event, id, data]: any) {
  // @ts-ignore
  window.__RECORD_REPLAY_ANNOTATION_HOOK__?.("replay-playwright", {
    event,
    id,
    data: data ? JSON.parse(data) : undefined,
  });
}

function getCurrentStep(testInfo: TestInfo): TestStepInternal {
  const steps = (testInfo as any)._steps;
  return steps[steps.length - 1];
}

function isReplayAnnotation(params?: any) {
  return params?.expression?.includes("ReplayAddAnnotation");
}

function parseLocation(stack?: string) {
  const pattern = /\/([^\/]+):(\d+):(\d+)$/;
  const firstLine = stack?.split("\n").find(l => pattern.test(l));
  const match = firstLine?.match(pattern);

  if (!match) {
    return {
      line: undefined,
      column: undefined,
    };
  }

  return {
    line: parseInt(match[2]),
    column: parseInt(match[3]),
  };
}

export interface ParsedErrorFrame {
  name: string;
  message: string;
  line: number | undefined;
  column: number | undefined;
}

function parseError(error: TestInfoError): ParsedErrorFrame {
  const location = parseLocation(error.stack);

  return {
    name: "name" in error ? (error.name as string) : "Error",
    message: error.message ?? "Unknown",
    line: location?.line,
    column: location?.column,
  };
}

function maybeMonkeyPatchTestInfo(
  testInfo: TestInfoInternal,
  addStepHandler: (step: TestStepInternal) => void,
  stepEndHandler: NonNullable<TestInfoInternal["_onStepEnd"]>
) {
  if (testInfo._addStep) {
    const original = testInfo._addStep;
    testInfo._addStep = function (...args) {
      const result = original.call(this, ...args);
      addStepHandler(result);
      return result;
    };
  }

  if (testInfo._onStepEnd) {
    const original = testInfo._onStepEnd;
    testInfo._onStepEnd = function (step) {
      const result = original.call(this, step);
      stepEndHandler(step);
      return result;
    };
  }
}

type Playwright = typeof import("playwright-core") & {
  _instrumentation: ClientInstrumentation;
};

export async function replayFixture(
  { playwright, browser }: { playwright: Playwright; browser: Browser },
  use: () => Promise<void>,
  testInfo: TestInfo
) {
  debug("Setting up replay fixture");

  const expectSteps = new Set<string>();
  let currentStep: TestStepInternal | undefined;

  const port = getServerPort();
  const ws = new WebSocket(`ws://localhost:${port}`);

  try {
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", error => reject(error));
    });
  } catch (error) {
    if (isErrorWithCode(error, "ECONNREFUSED")) {
      // the reporter didn't end up being used and thus the server is not running
      await use();
      return;
    }
    throw error;
  }

  const testIdData: TestIdData = {
    id: 0,
    attempt: testInfo.retry + 1,
    source: {
      title: testInfo.title,
      // this one only drops the filename (first segment) and the test title (last segment)
      // it's different from the one in the reporter, since the "root" suites are just the file suites created here:
      // https://github.com/microsoft/playwright/blob/a6488c4a2879a22e8da0f6708114ef7b9f4d253f/packages/playwright/src/common/testLoader.ts#L36
      // in this context they are not attached to the root and project suites
      scope: testInfo.titlePath.slice(1, -1),
    },
  };

  function addAnnotation(event: string, id?: string, detail?: Record<string, any>) {
    if (id) {
      return Promise.allSettled(
        browser.contexts().flatMap(context => {
          return context.pages().flatMap(async page => {
            try {
              await page.evaluate(ReplayAddAnnotation, [
                event,
                id,
                JSON.stringify({ ...detail, test: testIdData }),
              ]);
            } catch (e) {
              warn("Failed to add annotation", e);
            }
          });
        })
      );
    }
  }

  function handlePlaywrightEvent({
    detail,
    ...data
  }:
    | {
        event: "step:start";
        id: string;
        params: Record<string, any> | undefined;
        detail: StepStartDetail;
      }
    | {
        event: "step:end";
        id: string;
        params: Record<string, any> | undefined;
        detail: StepEndDetail;
      }) {
    try {
      assert(
        data.id != null,
        new ReporterError(Errors.MissingCurrentStep, "No current step for API call end")
      );

      if (
        // Do not emit replay annotations so we don't enter an infinite loop
        isReplayAnnotation(data.params) ||
        // Some `expect` calls (e.g. `expect.toBeVisible`) are API calls and
        // will be emitted by both the addStep "hook" and this method. addStep
        // is called before this so since we've already dispatched a step:start,
        // we'll skip emitting another here.
        expectSteps.has(data.id)
      ) {
        return;
      }

      ws.send(
        JSON.stringify({
          ...detail,
          ...data,
          test: testIdData,
        })
      );

      addAnnotation(data.event, data.id, detail);
    } catch (e) {
      let reporterError: ReporterError;

      if (e instanceof ReporterError) {
        reporterError = e;
      } else if (e instanceof Error) {
        reporterError = new ReporterError(Errors.UnexpectedError, e.message, { stack: e.stack });
      } else {
        reporterError = new ReporterError(Errors.UnexpectedError, "Unknown", { error: e });
      }

      try {
        ws.send(
          JSON.stringify({
            ...reporterError.valueOf(),
            test: testIdData,
            event: "error",
          })
        );
      } catch (wsError) {
        warn("Failed to send error to reporter", wsError);
      }
    }
  }

  maybeMonkeyPatchTestInfo(
    testInfo,
    function handleAddStep(step) {
      if (step.category !== "expect") {
        return;
      }

      handlePlaywrightEvent({
        event: "step:start",
        id: step.stepId,
        params: step.params,
        detail: {
          apiName: "expect",
          category: step.category,
          title: step.title,
          params: step.params || {},
          frames: step.location ? [step.location] : [],
        },
      });

      expectSteps.add(step.stepId);
    },
    function handleStepEnd(step) {
      if (expectSteps.has(step.stepId)) {
        handlePlaywrightEvent({
          event: "step:end",
          id: step.stepId,
          params: undefined,
          detail: {
            error: step.error ? parseError(step.error) : null,
          },
        });
      }
    }
  );

  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: (apiName, params, stackTraceOrFrames, _wallTime) => {
      currentStep = getCurrentStep(testInfo);
      handlePlaywrightEvent({
        event: "step:start",
        id: currentStep.stepId,
        params,
        detail: {
          apiName,
          category: currentStep.category,
          frames: stackTraceOrFrames
            ? "frames" in stackTraceOrFrames
              ? stackTraceOrFrames.frames
              : stackTraceOrFrames
            : [],
          params: params ?? {},
          title: currentStep.title,
        },
      });
    },

    onApiCallEnd: (userData, error) => {
      handlePlaywrightEvent({
        event: "step:end",
        id: currentStep!.stepId,
        params: userData?.userObject?.params,
        detail: {
          error: error ? parseError(error) : null,
        },
      });
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  await use();

  clientInstrumentation.removeListener(csiListener);
}

// this doesn't work for users using `_baseTest` (the one without any builtin fixtures)
// it's not quite a public API though - it's exported at runtime but it's underscored, not documented and not available in the types
export function addReplayFixture() {
  const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
  const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
  if (!fixtures) {
    debug("Failed to inject replay fixture");
    return;
  }

  fixtures.push({
    fixtures: {
      _replay: [replayFixture, { auto: true, _title: "Replay.io fixture" }],
    },
    location: {
      file: __filename,
      line: 38,
      column: 1,
    },
  });
}
