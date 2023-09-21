import { Page, TestInfo, test } from "@playwright/test";
import dbg from "debug";
import {
  ClientInstrumentationListener,
  ParsedStackTrace,
  TestInfoInternal,
  TestInfoStep,
} from "./playwrightTypes";
import WebSocket from "ws";
import { getServerPort } from "./server";
import { ReporterError, warn } from "@replayio/test-utils";
import assert from "assert";
import { Errors } from "./error";

export interface FixtureStepStart {
  id: string;
  apiName: string;
  params: Record<string, any>;
  stackTrace: ParsedStackTrace;
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

export interface FixtureStepEnd {
  id: string;
  error: Error | undefined;
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

function getLastStepId(testInfo: any) {
  return testInfo._steps[testInfo._steps.length - 1].stepId;
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

function parseError<T extends { name?: string; message: string; stack?: string }>(error: T) {
  if (!error) {
    return;
  }

  const location = parseLocation(error.stack);

  return {
    name: error.name || "Error",
    message: error.message,
    line: location?.line,
    column: location?.column,
  };
}

function maybeMonkeyPatchTestInfo(
  testInfo: TestInfoInternal,
  addStepHandler: (step: TestInfoStep) => void,
  stepEndHandler: TestInfoInternal["_onStepEnd"]
) {
  if (testInfo._addStep) {
    const original = testInfo._addStep.bind(testInfo);
    testInfo._addStep = (data, parentStep) => {
      const result = original(data, parentStep);
      addStepHandler?.(result);

      return result;
    };
  }

  if (testInfo._onStepEnd) {
    const original = testInfo._onStepEnd.bind(testInfo);
    testInfo._onStepEnd = step => {
      const result = original(step);
      stepEndHandler?.(step);

      return result;
    };
  }
}

export async function replayFixture(
  { playwright, page }: { playwright: any; page: Page },
  use: () => Promise<void>,
  testInfo: TestInfo
) {
  debug("Setting up replay fixture");

  const port = getServerPort();
  const ws = new WebSocket(`ws://localhost:${port}`);
  const expectSteps = new Set<string>();
  let currentStepId: string | undefined;

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", () => reject("Socket errored"));
  });

  const testIdData: TestIdData = {
    id: 0,
    attempt: testInfo.retry + 1,
    source: {
      title: testInfo.title,
      scope: testInfo.titlePath.slice(3, -1),
    },
  };

  function addAnnotation(event: string, id?: string, data?: Record<string, any>) {
    if (id) {
      page
        .evaluate(ReplayAddAnnotation, [event, id, JSON.stringify({ ...data, test: testIdData })])
        .catch(e => warn("Failed to add annotation", e));
    }
  }

  function handlePlaywrightEvent(
    event: "step:start" | "step:end",
    stepId: string | undefined,
    params: Record<string, any> | undefined,
    detail: Record<string, any>
  ) {
    try {
      assert(
        stepId != null,
        new ReporterError(Errors.MissingCurrentStep, "No current step for API call end")
      );

      if (
        // Do not emit replay annotations so we don't enter an infinite loop
        isReplayAnnotation(params) ||
        // Some `expect` calls (e.g. `expect.toBeVisible`) are API calls and
        // will be emitted by both the addStep "hook" and this method. addStep
        // is called before this so since we've already dispatched a step:start,
        // we'll skip emitting another here.
        expectSteps.has(stepId)
      ) {
        return;
      }

      ws.send(
        JSON.stringify({
          ...detail,
          event: event,
          id: stepId,
          test: testIdData,
        })
      );

      addAnnotation(event, stepId, detail);
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

      expectSteps.add(step.stepId);

      handlePlaywrightEvent("step:start", step.stepId, step.params, {
        apiName: "expect",
        params: step.params || {},
        stackTrace: {
          apiName: "expect",
          frameTexts: [],
          allFrames: step.location ? [step.location] : [],
          frames: step.location ? [step.location] : [],
        },
      });
    },
    function handleStepEnd(step) {
      if (expectSteps.has(step.stepId)) {
        handlePlaywrightEvent("step:end", step.stepId, undefined, {
          error: step.error ? parseError(step.error) : null,
        });
      }
    }
  );

  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: (apiName, params, stackTrace, _wallTime) => {
      currentStepId = getLastStepId(testInfo);
      handlePlaywrightEvent("step:start", currentStepId, params, { apiName, params, stackTrace });
    },

    onApiCallEnd: (userData, error) => {
      handlePlaywrightEvent("step:end", currentStepId, userData?.userObject?.params, {
        error: error ? parseError(error) : null,
      });
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  await use();

  clientInstrumentation.removeListener(csiListener);
}

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

export function isFixtureEnabled() {
  return !!process.env.REPLAY_PLAYWRIGHT_FIXTURE;
}
