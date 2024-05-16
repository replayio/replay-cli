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
  return !!error && typeof error === "object" && "code" in error && error.code === code;
}

interface StepStartDetail {
  apiName: string;
  category: TestStepInternal["category"];
  frames: StackFrame[];
  params: Record<string, any>;
  title: TestStepInternal["title"];
  hook: "afterAll" | "afterEach" | "beforeAll" | "beforeEach" | undefined;
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

declare global {
  interface Window {
    __RECORD_REPLAY_ANNOTATION_HOOK__?: (
      source: string,
      data: { event: string; id: string; data: unknown }
    ) => void;
  }
}

function ReplayAddAnnotation([event, id, data]: readonly [string, string, string]) {
  window.__RECORD_REPLAY_ANNOTATION_HOOK__?.("replay-playwright", {
    event,
    id,
    data: data ? JSON.parse(data) : undefined,
  });
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

type Playwright = typeof import("playwright-core") & {
  _instrumentation: ClientInstrumentation;
};

const patchedTestInfos = new WeakSet<TestInfoInternal>();

export async function replayFixture(
  { playwright, browser }: { playwright: Playwright; browser: Browser },
  use: () => Promise<void>,
  testInfo: TestInfoInternal
) {
  // fixtures are created repeatedly for the same test
  // since they are often created for hooks too
  // it's important to avoid setting up the fixture multiple times
  // otherwise the reporter would get notified multiple times about the same steps
  if (patchedTestInfos.has(testInfo)) {
    return use();
  }
  patchedTestInfos.add(testInfo);

  // start of before hooks can't be intercepted by the fixture in `_addStep`
  // `_addStep` gets monkey-patched in the this fixture but fixtures are registered in the `_runAsStage`'s callbacks like here:
  // https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/worker/workerMain.ts#L557-L566
  // while the hook steps are added as part of those main `_runAsStage` functions
  function getCurrentHookType() {
    if (testInfo._currentHookType) {
      return testInfo._currentHookType();
    }

    // based on the removed `hookType` util from Playwright's code:
    // https://github.com/microsoft/playwright/pull/29863/files#diff-e29aa8067f8fe0e63272392dfa682ea47cf92ec4257dffbd725f6c4992f48896L399-L403
    const type = testInfo._timeoutManager?.currentRunnableType?.();
    if (
      type === "afterAll" ||
      type === "afterEach" ||
      type === "beforeAll" ||
      type === "beforeEach"
    ) {
      return type;
    }
  }

  debug("Setting up replay fixture");

  const expectSteps = new Set<string>();

  const port = getServerPort();
  const ws = new WebSocket(`ws://localhost:${port}`);

  try {
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", error => reject(error));
      // TODO: close WS connections on test end
      // to avoid relying on TestInfo's internals for this the reporter could notify the connection when the test ends
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
              // this leads to adding a regular step in the test
              // it would be best if this could be avoided somehow
              await page.evaluate(ReplayAddAnnotation, [
                event,
                id,
                JSON.stringify({ ...detail, test: testIdData }),
              ] as const);
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

  const addStep = testInfo._addStep;
  testInfo._addStep = function (...args) {
    const step = addStep.call(this, ...args);

    if (step.category === "expect") {
      // expects are not passed through the client side instrumentation (since Playwright 1.41.0: https://github.com/microsoft/playwright/pull/28609)
      // https://github.com/microsoft/playwright/blob/5fa0583dcb708e74d2f7fc456b8c44cec9752709/packages/playwright-core/src/client/channelOwner.ts#L186-L188
      // they call `_addStep` directly
      // https://github.com/microsoft/playwright/blob/5fa0583dcb708e74d2f7fc456b8c44cec9752709/packages/playwright/src/matchers/expect.ts#L267-L275
      // so we need to handle them here
      expectSteps.add(step.stepId);

      console.log(`***** ${JSON.stringify(step)} ${new Error().stack}`);
      handlePlaywrightEvent({
        event: "step:start",
        id: step.stepId,
        params: step.params,
        detail: {
          apiName: "expect",
          category: step.category,
          title: step.title,
          params: step.params || {},
          // TODO: this is unhelpful as it points to the monkey-patched function itself
          frames: step.location ? [step.location] : [],
          hook: getCurrentHookType(),
        },
      });
    }
    return step;
  };

  const onStepEnd = testInfo._onStepEnd;
  testInfo._onStepEnd = function (...args) {
    onStepEnd.call(this, ...args);

    const [payload] = args;
    if (expectSteps.has(payload.stepId)) {
      handlePlaywrightEvent({
        event: "step:end",
        id: payload.stepId,
        params: undefined,
        detail: {
          error: payload.error ? parseError(payload.error) : null,
        },
      });
    }
  };

  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: (apiName, params, stackTraceOrFrames, wallTime, userData) => {
      if (isReplayAnnotation(params)) {
        // do not emit page.evaluate steps that add replay annotations
        // this would create an infinite async loop
        return;
      }

      // `.userObject` holds the step data
      // https://github.com/microsoft/playwright/blob/8dec672121bb12dbc8371995c1cdba3ca0565ffb/packages/playwright/src/index.ts#L254-L261
      // this has been introduced in Playwright 1.17.0
      const step: TestStepInternal | undefined = userData?.userObject;

      if (!step) {
        return;
      }

      if (expectSteps.has(step.stepId)) {
        // at least some `expect` calls were API calls at some point (https://github.com/microsoft/playwright/pull/9117)
        // all of them are added through `_addStep` (it gets called first) and thus those are filtered out here
        return;
      }

      handlePlaywrightEvent({
        event: "step:start",
        id: step.stepId,
        params,
        detail: {
          apiName,
          category: step.category,
          frames: stackTraceOrFrames
            ? "frames" in stackTraceOrFrames
              ? stackTraceOrFrames.frames
              : stackTraceOrFrames
            : [],
          params: params ?? {},
          title: step.title,
          hook: getCurrentHookType(),
        },
      });
    },

    onApiCallEnd: (userData, error) => {
      const step: TestStepInternal = userData?.userObject;
      handlePlaywrightEvent({
        event: "step:end",
        id: step.stepId,
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
      _replay: [
        replayFixture,
        {
          // "all-hooks-included" is supported since Playwright 1.23.0
          // https://github.com/microsoft/playwright/pull/14104
          auto: "all-hooks-included",
          _title: "Replay.io fixture",
        },
      ],
    },
  });
}
