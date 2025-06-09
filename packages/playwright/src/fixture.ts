import { type Browser, type TestInfoError, test } from "@playwright/test";
import { logError, logInfo } from "@replay-cli/shared/logger";
import { ReporterError, getMetadataFilePath } from "@replayio/test-utils";
import assert from "node:assert/strict";
import { REPLAY_CONTENT_TYPE } from "./constants";
import { Errors } from "./error";
import { mkdirSync, writeFileSync } from "node:fs";
import { v4 as uuid } from "uuid";
import { dirname } from "node:path";
import type {
  ClientInstrumentation,
  ClientInstrumentationListener,
  StackFrame,
  TestInfoImpl,
  TestStepInternal,
} from "./playwrightTypes";
import { captureRawStack, filteredStackTrace } from "./stackTrace";

const baseId = uuid();
const workerIndex = +(process.env.TEST_WORKER_INDEX || 0);
export const metadataFilePath = getMetadataFilePath("PLAYWRIGHT", workerIndex);

function getBaseMetadata() {
  let baseMetadata = process.env.PLAYWRIGHT_REPLAY_METADATA || process.env.RECORD_REPLAY_METADATA;
  if (baseMetadata && typeof baseMetadata === "string") {
    try {
      return JSON.parse(baseMetadata);
    } catch (error) {
      logError("ReplayFixture:FailedParseBaseMetadata", { error, baseMetadata });
    }
  }
  return {};
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

export interface TestExecutionData {
  executionId: string;
  filePath: string;
  projectName: string | undefined;
  repeatEachIndex: number;
  attempt: number;
  source: {
    title: string;
    scope: string[];
  };
}

interface FixtureStepStartEvent extends FixtureStepStart {
  event: "step:start";
  test: TestExecutionData;
}

interface StepEndDetail {
  error: ParsedErrorFrame | null;
}

export interface FixtureStepEnd extends StepEndDetail {
  id: string;
}

interface FixtureStepEndEvent extends FixtureStepEnd {
  event: "step:end";
  test: TestExecutionData;
}

export interface ReporterErrorEvent extends ReporterError {
  event: "error";
  test: TestExecutionData;
}

export type FixtureEvent = FixtureStepStartEvent | FixtureStepEndEvent | ReporterErrorEvent;

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

type Playwright = {
  // it's available (as non-nullable) since 1.34.0
  _instrumentation: ClientInstrumentation;
};

const fixtureStates = new WeakMap<
  TestInfoImpl,
  {
    expectSteps: Set<string>;
    ignoredSteps: Set<string>;
    testData: TestExecutionData;
  }
>();

function getFixtureState(testInfo: TestInfoImpl) {
  let state = fixtureStates.get(testInfo);
  if (!state) {
    const attempt = testInfo.retry + 1;
    const testData: TestExecutionData = {
      executionId: `${baseId}-${testInfo.testId}-${testInfo.repeatEachIndex}-${attempt}`,
      filePath: testInfo.file,
      projectName: testInfo.project.name,
      repeatEachIndex: testInfo.repeatEachIndex,
      attempt,
      source: {
        title: testInfo.title,
        // this one only drops the filename (first segment) and the test title (last segment)
        // it's different from the one in the reporter, since the "root" suites are just the file suites created here:
        // https://github.com/microsoft/playwright/blob/73285245566bdce80bab736577e9bc278d5cf4bf/packages/playwright/src/common/testLoader.ts#L38
        // in this context they are not attached to the root and project suites
        scope: testInfo.titlePath.slice(1, -1),
      },
    };
    state = {
      expectSteps: new Set(),
      ignoredSteps: new Set(),
      testData: testData,
    };
    fixtureStates.set(testInfo, state);
  }
  return state;
}

const patchedTestInfos = new WeakSet<TestInfoImpl>();

export async function replayFixture(
  { playwright, browser }: { playwright: Playwright; browser: Browser },
  use: () => Promise<void>,
  testInfo: TestInfoImpl
) {
  const { expectSteps, ignoredSteps, testData } = getFixtureState(testInfo);

  // fixtures are created repeatedly for the same test
  // since they are created for beforeAll and afterAll hooks too
  // it's important to avoid patching the test info multiple times
  // otherwise the reporter would get notified multiple times about the same steps
  if (!patchedTestInfos.has(testInfo)) {
    patchedTestInfos.add(testInfo);

    const addStep = testInfo._addStep;
    testInfo._addStep = function (data, ...rest) {
      // expects are not passed through the client side instrumentation (since Playwright 1.41.0: https://github.com/microsoft/playwright/pull/28609)
      // https://github.com/microsoft/playwright/blob/5fa0583dcb708e74d2f7fc456b8c44cec9752709/packages/playwright-core/src/client/channelOwner.ts#L186-L188
      // they call `_addStep` directly
      // https://github.com/microsoft/playwright/blob/5fa0583dcb708e74d2f7fc456b8c44cec9752709/packages/playwright/src/matchers/expect.ts#L267-L275
      // so we need to handle them here
      if (data.category === "expect") {
        let frames = data.location ? [data.location] : undefined;
        if (!frames) {
          // based on those lines we replicate how Playwright computes the location and precompute it here for it so it uses ours
          // https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/worker/testInfo.ts#L266-L272
          const filteredStack = filteredStackTrace(captureRawStack());
          data.location = filteredStack[0];
          frames = filteredStack;
        }

        const step = addStep.call(this, data, ...rest);
        expectSteps.add(step.stepId);

        handlePlaywrightEvent({
          event: "step:start",
          id: step.stepId,
          params: step.params,
          detail: {
            apiName: "expect",
            category: step.category,
            title: step.title,
            params: step.params || {},
            frames,
            hook: getCurrentHookType(),
          },
        }).catch(err => {
          // this should never happen since `handlePlaywrightEvent` should always catch errors internally and shouldn't throw
          logError("ReplayFixture:FailedToAddExpectStep", { error: err });
        });

        return step;
      }

      return addStep.call(this, data, ...rest);
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
        }).catch(err => {
          // this should never happen since `handlePlaywrightEvent` should always catch errors internally and shouldn't throw
          logError("ReplayFixture:FailedToAddExpectStepEnd", { error: err });
        });
      }
    };
  }

  // start of before hooks can't be intercepted by the fixture in `_addStep`
  // `_addStep` gets monkey-patched in this fixture but fixtures are registered in the `_runAsStage`'s callbacks like here:
  // https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/worker/workerMain.ts#L557-L566
  // while the hook steps are added as part of those main `_runAsStage` functions
  function getCurrentHookType() {
    return testInfo._currentHookType();
  }

  logInfo("ReplayFixture:SettingUp");

  async function addAnnotation(event: string, id?: string, detail?: Record<string, any>) {
    if (!id) {
      return;
    }

    return Promise.allSettled(
      browser.contexts().flatMap(context => {
        return context.pages().flatMap(async page => {
          try {
            // this leads to adding a regular step in the test
            // it would be best if this could be avoided somehow
            await page.evaluate(ReplayAddAnnotation, [
              event,
              id,
              JSON.stringify({ ...detail, test: testData }),
            ] as const);
          } catch (error) {
            // `onApiCallBegin`/`onApiCallEnd` are not awaited, see: https://github.com/microsoft/playwright/pull/30795
            // not much can be done about it, an *attempt* could be done to override builtin fixtures like `page` and `browser` to install our hooks there,
            // it's not worth it when a convenient API is available though
            // even when the issue gets fixed, it's still a good idea to catch those errors here and `debug` them
            // they can't be *logged* here because that interferes with the active reporter output
            logError("ReplayFixture:FailedToAddAnnotation", { error });
          }
        });
      })
    );
  }

  async function handlePlaywrightEvent({
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

      testInfo.attach(`replay:${data.event}`, {
        body: JSON.stringify({
          ...detail,
          ...data,
        }),
        contentType: REPLAY_CONTENT_TYPE,
      });

      return addAnnotation(data.event, data.id, detail);
    } catch (error) {
      let reporterError: ReporterError;

      if (error instanceof ReporterError) {
        reporterError = error;
      } else if (error instanceof Error) {
        reporterError = new ReporterError(Errors.UnexpectedError, error.message, {
          stack: error.stack,
        });
      } else {
        reporterError = new ReporterError(Errors.UnexpectedError, "Unknown", { error: error });
      }

      testInfo.attach("replay:step:error", {
        body: JSON.stringify(reporterError.valueOf()),
        contentType: REPLAY_CONTENT_TYPE,
      });
    }
  }

  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: ({ userData, params, apiName, frames }) => {
      // `.userObject` holds the step data
      // https://github.com/microsoft/playwright/blob/73285245566bdce80bab736577e9bc278d5cf4bf/packages/playwright/src/index.ts#L274-L283
      // this has been introduced in Playwright 1.17.0
      const step: TestStepInternal | undefined = userData;

      if (!step?.stepId) {
        return;
      }

      if (isReplayAnnotation(params)) {
        // do not emit page.evaluate steps that add replay annotations
        // this would create an infinite async loop
        ignoredSteps.add(step.stepId);
        return;
      }

      if (expectSteps.has(step.stepId)) {
        // at least some `expect` calls were API calls at some point (https://github.com/microsoft/playwright/pull/9117)
        // all of them are added through `_addStep` (it gets called first) and thus those are filtered out here
        return;
      }

      if (!frames.length) {
        // if frames are empty it likely means that the api call has been made from Playwright internals
        // this helps us to ignore steps created by builtin fixtures like `page` and `browser`
        ignoredSteps.add(step.stepId);
        return;
      }

      return handlePlaywrightEvent({
        event: "step:start",
        id: step.stepId,
        params,
        detail: {
          apiName,
          category: step.category,
          frames,
          params: params ?? {},
          title: step.title,
          hook: getCurrentHookType(),
        },
      });
    },

    onApiCallEnd: ({ userData, error, params }) => {
      const step: TestStepInternal | undefined = userData;
      if (!step?.stepId || ignoredSteps.has(step.stepId)) {
        return;
      }
      return handlePlaywrightEvent({
        event: "step:end",
        id: step.stepId,
        params,
        detail: {
          error: error ? parseError(error) : null,
        },
      });
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  try {
    const metadata = {
      ...getBaseMetadata(),
      "x-replay-test": {
        id: testData.executionId,
      },
    };
    logInfo("ReplayFixture:WillWriteMetadata", { metadataFilePath, metadata });
    mkdirSync(dirname(metadataFilePath), { recursive: true });
    writeFileSync(metadataFilePath, JSON.stringify(metadata, undefined, 2));
  } catch (error) {
    logError("ReplayFixture:InitReplayMetadataFailed", {
      error,
    });
  }

  testInfo.attach(`replay:test:start`, {
    body: JSON.stringify({
      executionId: testData.executionId,
    }),
    contentType: REPLAY_CONTENT_TYPE,
  });
  await use();

  clientInstrumentation.removeListener(csiListener);
}

// this doesn't work for users using `_baseTest` (the one without any builtin fixtures)
// it's not quite a public API though - it's exported at runtime but it's underscored, not documented and not available in the types
export function addReplayFixture() {
  const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
  const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
  if (!fixtures) {
    logError("ReplayFixture:FailedToInject");
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
