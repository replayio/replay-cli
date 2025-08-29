/* Copyright 2020-2024 Record Replay Inc. */
import { defineConfig as ctDefineConfig, test, expect } from "@playwright/experimental-ct-react";
import { getRuntimePath } from "@replay-cli/shared/runtime/getRuntimePath";
import { initMetadataFile } from "@replayio/test-utils";
import { metadataFilePath, replayCTFixture } from "./fixture";
import { type ReplayPlaywrightConfig } from "./reporter";
import type {
  BrowserContext,
  APIRequestContext,
  TestInfoError,
} from "@playwright/test";
import type { Page } from "playwright-core";
// #region Playwright internal types (same as Vibe Coder)

type TestInfoErrorImpl = TestInfoError;

interface TestStepInternal {
  complete(result: { error?: Error | unknown; suggestedRebaseline?: string }): void;
  info: {
    _stepId: string;
  };
  attachmentIndices: number[];
  stepId: string;
  title: string;
  category: string;
  location?: Location;
  boxedStack?: StackFrame[];
  steps: TestStepInternal[];
  endWallTime?: number;
  apiName?: string;
  params?: Record<string, any>;
  error?: TestInfoErrorImpl;
  infectParentStepsWithError?: boolean;
  box?: boolean;
}

type StackFrame = {
  file: string;
  line: number;
  column: number;
  function?: string;
};

type StepBeginPayload = {
  testId: string;
  stepId: string;
  parentStepId: string | undefined;
  title: string;
  category: string;
  wallTime: number; // milliseconds since unix epoch
  location?: { file: string; line: number; column: number };
};

interface ApiCallData {
  apiName: string;
  params?: Record<string, any>;
  frames: StackFrame[];
  userData: any;
  stepId?: string;
  error?: Error;
}

interface ClientInstrumentation {
  addListener(listener: ClientInstrumentationListener): void;
  removeListener(listener: ClientInstrumentationListener): void;
  removeAllListeners(): void;
  onApiCallBegin(apiCall: ApiCallData): void;
  onApiCallEnd(apiCal: ApiCallData): void;
  onWillPause(options: { keepTestTimeout: boolean }): void;

  runAfterCreateBrowserContext(context: BrowserContext): Promise<void>;
  runAfterCreateRequestContext(context: APIRequestContext): Promise<void>;
  runBeforeCloseBrowserContext(context: BrowserContext): Promise<void>;
  runBeforeCloseRequestContext(context: APIRequestContext): Promise<void>;
}

interface ClientInstrumentationListener {
  onApiCallBegin?(apiCall: ApiCallData): void;
  onApiCallEnd?(apiCall: ApiCallData): void;
  onWillPause?(options: { keepTestTimeout: boolean }): void;

  runAfterCreateBrowserContext?(context: BrowserContext): Promise<void>;
  runAfterCreateRequestContext?(context: APIRequestContext): Promise<void>;
  runBeforeCloseBrowserContext?(context: BrowserContext): Promise<void>;
  runBeforeCloseRequestContext?(context: APIRequestContext): Promise<void>;
}
// #endregion

interface Playwright {
  // it's available (as non-nullable) since 1.34.0
  _instrumentation: ClientInstrumentation;
}

// Re-export test and expect for CT users
export { test, expect };

function getExecutablePath() {
  return getRuntimePath();
}

function getDeviceConfig() {
  const executablePath = getExecutablePath();

  const env: Record<string, any> = {
    ...process.env,
    RECORD_ALL_CONTENT: 1,
    RECORD_REPLAY_ENABLE_ASSERTS: process.env.RECORD_REPLAY_ENABLE_ASSERTS,
    // it doesn't log anything eagerly but it makes it possible to enable verbose logs with DEBUG=pw:browser
    RECORD_REPLAY_VERBOSE: 1,
    RECORD_REPLAY_METADATA: undefined,
    RECORD_REPLAY_METADATA_FILE: initMetadataFile(metadataFilePath),
  };

  if (process.env.RECORD_REPLAY_NO_RECORD) {
    env.RECORD_ALL_CONTENT = "";
    env.RECORD_REPLAY_DRIVER = __filename;
  }

  return {
    launchOptions: {
      get executablePath() {
        if (!executablePath) {
          throw new Error(`replay-chromium is not supported on this platform`);
        }

        return executablePath;
      },
      env,
    },
    defaultBrowserType: "chromium" as const,
  };
}

// Export defineConfig with CT support and Replay devices
export function defineConfig(config: any) {
  // Ensure we're using Replay Chromium for CT tests
  const enhancedConfig = {
    ...config,
    use: {
      ...config.use,
      ...getDeviceConfig(),
    },
  };

  return ctDefineConfig(enhancedConfig);
}

export const devices = {
  get "Replay Chromium"() {
    return getDeviceConfig();
  },
};

// Export the reporter as a tuple for Playwright config compatibility
export function replayReporter(config: ReplayPlaywrightConfig) {
  return ["@replayio/playwright-ct/reporter", config] as const;
}
export type { ReplayPlaywrightConfig };

function addReplayCTFixture() {
  const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
  const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
  if (!fixtures) {
    console.error("[replay.io CT]: Failed to inject fixture");
    return;
  }

  fixtures.push({
    fixtures: {
      _replayct: [
        replayCTFixture,
        {
          auto: "all-hooks-included",
          _title: "Replay.io CT fixture",
          timeout: 5000,
        },
      ],
    },
  });
}

type ExtractMountResultFromTest<TTest extends (...args: any[]) => any> =
  Parameters<TTest>[2] extends (...args: infer BodyArgs) => any
    ? BodyArgs[0] extends { mount: (...args: any[]) => infer R }
      ? Awaited<R>
      : never
    : never;

export type MountResult = ExtractMountResultFromTest<typeof test>;

export async function takeComponentScreenshot(component: MountResult, page: Page, filename: string, padding = 20) {
  const bounds = await component.boundingBox();
  if (bounds) {
    await page.screenshot({
      path: filename,
      clip: {
        x: Math.max(0, bounds.x - padding),
        y: Math.max(0, bounds.y - padding),
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      },
    });
  }
}


// ⚠️ this is an initialization-time side-effect (same as regular @replayio/playwright)
// there is no other way to add this fixture reliably to make it available automatically
//
// `globalSetup` doesn't work because this has to be executed in a worker context
// and `globalSetup` is executed in the worker's parent process
//
// project dependencies can't be used because they can't execute files from node_modules
// but since setup/teardown is done using `test` when using this strategy
// it would likely be too late for this to be added there anyway
//
// currently this works somewhat accidentally, it only works because Playwright workers load config files
// if the config would be serialized and passed down to them from the parent it wouldn't work
addReplayCTFixture();
