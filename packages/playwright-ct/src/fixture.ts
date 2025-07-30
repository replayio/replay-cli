import type { Locator, Page, TestInfo } from "@playwright/test";
import { logError, logInfo } from "@replay-cli/shared/logger";
import { ReporterError, getMetadataFilePath } from "@replayio/test-utils";
import assert from "node:assert/strict";
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
import { REPLAY_CONTENT_TYPE } from "./constants";
import { Errors } from "./error";

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

function parseError(error: any): ParsedErrorFrame {
  const location = parseLocation(error.stack);

  return {
    name: "name" in error ? (error.name as string) : "Error",
    message: error.message ?? "Unknown",
    line: location?.line,
    column: location?.column,
  };
}

type Playwright = {
  _instrumentation: ClientInstrumentation;
};

const fixtureStates = new WeakMap<
  TestInfoImpl,
  {
    expectSteps: Set<string>;
    ignoredSteps: Set<string>;
    testData: TestExecutionData;
    mountedComponents: Map<string, { componentName: string; mountTime: number }>;
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
        scope: testInfo.titlePath.slice(1, -1),
      },
    };
    state = {
      expectSteps: new Set(),
      ignoredSteps: new Set(),
      testData: testData,
      mountedComponents: new Map(),
    };
    fixtureStates.set(testInfo, state);
  }
  return state;
}

const patchedTestInfos = new WeakSet<TestInfoImpl>();

// Enhanced mount tracking
interface MountTracker {
  trackMount(componentId: string, componentName: string): void;
  trackUnmount(componentId: string): void;
  getMountedComponents(): Map<string, { componentName: string; mountTime: number }>;
}

function createMountTracker(testInfo: TestInfoImpl): MountTracker {
  const state = getFixtureState(testInfo);

  return {
    trackMount(componentId: string, componentName: string) {
      state.mountedComponents.set(componentId, {
        componentName,
        mountTime: Date.now(),
      });
    },
    trackUnmount(componentId: string) {
      state.mountedComponents.delete(componentId);
    },
    getMountedComponents() {
      return state.mountedComponents;
    },
  };
}

// Main CT fixture that integrates with Replay
export async function replayCTFixture(
  { page, mount, playwright }: { page: Page; mount: any; playwright: Playwright },
  use: (fixtures: { mount: any }) => Promise<void>,
  testInfo: TestInfoImpl
) {
  const { expectSteps, ignoredSteps, testData } = getFixtureState(testInfo);
  const mountTracker = createMountTracker(testInfo);

  console.log("[replay.io CT]: ReplayCTFixture being called for test:", testInfo.title);
  logInfo("ReplayCTFixture:SettingUp");

  // Initialize metadata file
  try {
    const metadata = {
      ...getBaseMetadata(),
      "x-replay-test": {
        id: testData.executionId,
      },
    };
    logInfo("ReplayCTFixture:WillWriteMetadata", { metadataFilePath, metadata });
    mkdirSync(dirname(metadataFilePath), { recursive: true });
    writeFileSync(metadataFilePath, JSON.stringify(metadata, undefined, 2));
  } catch (error) {
    logError("ReplayCTFixture:InitReplayMetadataFailed", { error });
  }

  // Attach test start event
  testInfo.attach(`replay:test:start`, {
    body: JSON.stringify({
      executionId: testData.executionId,
    }),
    contentType: REPLAY_CONTENT_TYPE,
  });

  // Patch testInfo to track expects and other operations
  if (!patchedTestInfos.has(testInfo)) {
    patchedTestInfos.add(testInfo);

    const addStep = testInfo._addStep;
    testInfo._addStep = function (data, ...rest) {
      if (data.category === "expect") {
        let frames = data.location ? [data.location] : undefined;
        if (!frames) {
          const filteredStack = filteredStackTrace(captureRawStack());
          data.location = filteredStack[0];
          frames = filteredStack;
        }

        const step = addStep.call(this, data, ...rest);
        expectSteps.add(step.stepId);

        testInfo.attach(`replay:step:start`, {
          body: JSON.stringify({
            event: "step:start",
            id: step.stepId,
            test: testData,
            apiName: "expect",
            category: step.category,
            title: step.title,
            params: step.params || {},
            frames,
            hook: testInfo._currentHookType?.(),
          }),
          contentType: REPLAY_CONTENT_TYPE,
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
        testInfo.attach(`replay:step:end`, {
          body: JSON.stringify({
            event: "step:end",
            id: payload.stepId,
            test: testData,
            error: payload.error ? parseError(payload.error) : null,
          }),
          contentType: REPLAY_CONTENT_TYPE,
        });
      }
    };
  }

  // Set up page annotation hook
  async function addAnnotation(event: string, id?: string, detail?: Record<string, any>) {
    if (!id) {
      return;
    }

    try {
      await page.evaluate(ReplayAddAnnotation, [
        event,
        id,
        JSON.stringify({ ...detail, test: testData }),
      ] as const);
    } catch (error) {
      logError("ReplayCTFixture:FailedToAddAnnotation", { error });
    }
  }

  // Set up client instrumentation listener
  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: ({ userData, params, apiName, frames }) => {
      const step: TestStepInternal | undefined = userData;

      if (!step?.stepId) {
        return;
      }

      if (isReplayAnnotation(params)) {
        ignoredSteps.add(step.stepId);
        return;
      }

      if (expectSteps.has(step.stepId)) {
        return;
      }

      if (!frames.length) {
        ignoredSteps.add(step.stepId);
        return;
      }

      testInfo.attach(`replay:step:start`, {
        body: JSON.stringify({
          event: "step:start",
          id: step.stepId,
          test: testData,
          apiName,
          category: step.category,
          frames,
          params: params ?? {},
          title: step.title,
          hook: testInfo._currentHookType?.(),
        }),
        contentType: REPLAY_CONTENT_TYPE,
      });

      return addAnnotation("step:start", step.stepId, {
        apiName,
        category: step.category,
        title: step.title,
        params: params || {},
        frames,
        hook: testInfo._currentHookType?.(),
      });
    },

    onApiCallEnd: ({ userData, error, params }) => {
      const step: TestStepInternal | undefined = userData;
      if (!step?.stepId || ignoredSteps.has(step.stepId)) {
        return;
      }

      testInfo.attach(`replay:step:end`, {
        body: JSON.stringify({
          event: "step:end",
          id: step.stepId,
          test: testData,
          error: error ? parseError(error) : null,
        }),
        contentType: REPLAY_CONTENT_TYPE,
      });

      return addAnnotation("step:end", step.stepId, {
        error: error ? parseError(error) : null,
      });
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  // Enhanced mount function that tracks component lifecycle
  const enhancedMount = async (component: any, options?: any) => {
    console.log(
      "[replay.io CT]: Enhanced mount called for component:",
      component?.type?.name || component?.type || "Component"
    );
    const componentId = uuid();
    const componentName = component?.type?.name || component?.type || "Component";

    // Track mount start
    const mountStepId = uuid();
    testInfo.attach(`replay:step:start`, {
      body: JSON.stringify({
        event: "step:start",
        id: mountStepId,
        test: testData,
        apiName: "mount",
        category: "pw:api",
        title: `mount: ${componentName}`,
        params: { component: componentName, options },
        frames: filteredStackTrace(captureRawStack()),
        hook: undefined,
      }),
      contentType: REPLAY_CONTENT_TYPE,
    });

    await addAnnotation("step:start", mountStepId, {
      apiName: "mount",
      category: "pw:api",
      title: `mount: ${componentName}`,
      params: { component: componentName, options },
      frames: filteredStackTrace(captureRawStack()),
    });

    try {
      // Call original mount
      const mounted = await mount(component, options);

      // Track successful mount
      mountTracker.trackMount(componentId, componentName);

      // Wrap the returned locator with enhanced unmount
      const enhancedLocator: any = Object.assign(mounted, {
        unmount: async () => {
          const unmountStepId = uuid();

          // Track unmount start
          testInfo.attach(`replay:step:start`, {
            body: JSON.stringify({
              event: "step:start",
              id: unmountStepId,
              test: testData,
              apiName: "unmount",
              category: "pw:api",
              title: `unmount: ${componentName}`,
              params: { component: componentName },
              frames: filteredStackTrace(captureRawStack()),
              hook: undefined,
            }),
            contentType: REPLAY_CONTENT_TYPE,
          });

          await addAnnotation("step:start", unmountStepId, {
            apiName: "unmount",
            category: "pw:api",
            title: `unmount: ${componentName}`,
            params: { component: componentName },
            frames: filteredStackTrace(captureRawStack()),
          });

          try {
            // Call original unmount
            await mounted.unmount();

            // Track successful unmount
            mountTracker.trackUnmount(componentId);

            // Track unmount end
            testInfo.attach(`replay:step:end`, {
              body: JSON.stringify({
                event: "step:end",
                id: unmountStepId,
                test: testData,
                error: null,
              }),
              contentType: REPLAY_CONTENT_TYPE,
            });

            await addAnnotation("step:end", unmountStepId, {
              error: null,
            });
          } catch (error) {
            // Track unmount error
            testInfo.attach(`replay:step:end`, {
              body: JSON.stringify({
                event: "step:end",
                id: unmountStepId,
                test: testData,
                error: parseError(error),
              }),
              contentType: REPLAY_CONTENT_TYPE,
            });

            await addAnnotation("step:end", unmountStepId, {
              error: parseError(error),
            });

            throw error;
          }
        },

        update: async (newComponent: any) => {
          const updateStepId = uuid();

          // Track update
          testInfo.attach(`replay:step:start`, {
            body: JSON.stringify({
              event: "step:start",
              id: updateStepId,
              test: testData,
              apiName: "update",
              category: "pw:api",
              title: `update: ${componentName}`,
              params: { component: componentName },
              frames: filteredStackTrace(captureRawStack()),
              hook: undefined,
            }),
            contentType: REPLAY_CONTENT_TYPE,
          });

          await addAnnotation("step:start", updateStepId, {
            apiName: "update",
            category: "pw:api",
            title: `update: ${componentName}`,
            params: { component: componentName },
            frames: filteredStackTrace(captureRawStack()),
          });

          try {
            await mounted.update(newComponent);

            testInfo.attach(`replay:step:end`, {
              body: JSON.stringify({
                event: "step:end",
                id: updateStepId,
                test: testData,
                error: null,
              }),
              contentType: REPLAY_CONTENT_TYPE,
            });

            await addAnnotation("step:end", updateStepId, {
              error: null,
            });
          } catch (error) {
            testInfo.attach(`replay:step:end`, {
              body: JSON.stringify({
                event: "step:end",
                id: updateStepId,
                test: testData,
                error: parseError(error),
              }),
              contentType: REPLAY_CONTENT_TYPE,
            });

            await addAnnotation("step:end", updateStepId, {
              error: parseError(error),
            });

            throw error;
          }
        },
      });

      // Track mount end
      testInfo.attach(`replay:step:end`, {
        body: JSON.stringify({
          event: "step:end",
          id: mountStepId,
          test: testData,
          error: null,
        }),
        contentType: REPLAY_CONTENT_TYPE,
      });

      await addAnnotation("step:end", mountStepId, {
        error: null,
      });

      return enhancedLocator;
    } catch (error) {
      // Track mount error
      testInfo.attach(`replay:step:end`, {
        body: JSON.stringify({
          event: "step:end",
          id: mountStepId,
          test: testData,
          error: parseError(error),
        }),
        contentType: REPLAY_CONTENT_TYPE,
      });

      await addAnnotation("step:end", mountStepId, {
        error: parseError(error),
      });

      throw error;
    }
  };

  // Add page init script
  try {
    await page.addInitScript(() => {
      window.__RECORD_REPLAY_ANNOTATION_HOOK__ = (source, data) => {
        console.log("[Replay Annotation]", source, data);
      };
    });
  } catch (error) {
    logError("ReplayCTFixture:FailedToAddInitScript", { error });
  }

  await use({ mount: enhancedMount });

  clientInstrumentation.removeListener(csiListener);
}
