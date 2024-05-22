// Types imported from playwright and used by our fixture

import type { APIRequestContext, BrowserContext, TestInfo, TestInfoError } from "@playwright/test";

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L57
export interface TestInfoInternal extends TestInfo {
  // https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L247C18-L247C22
  _addStep: (data: Omit<TestStepInternal, "complete" | "stepId" | "steps">) => TestStepInternal;
  // https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L58
  // introduced in Playwright 1.30.0
  _onStepBegin: (step: StepBeginPayload) => void;
  // https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L59
  // introduced in Playwright 1.30.0
  _onStepEnd: (step: StepEndPayload) => void;
  // https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/worker/testInfo.ts#L404-L410
  // introduced in Playwright 1.43.0
  _currentHookType?: () => "beforeEach" | "afterEach" | "beforeAll" | "afterAll" | undefined;
  _timeoutManager?: {
    /* doesn't exist since Playwright 1.43.0 */
    currentRunnableType?: () => RunnableType;
  };
}

// https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/worker/timeoutManager.ts#L26
type RunnableType =
  | "test"
  | "beforeAll"
  | "afterAll"
  | "beforeEach"
  | "afterEach"
  | "slow"
  | "skip"
  | "fail"
  | "fixme"
  | "teardown";

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L32
export interface TestStepInternal {
  stepId: string;
  location: StackFrame;
  category: "hook" | "fixture" | "test.step" | string;
  title: string;
  params?: Record<string, any>;
  wallTime: number;
}

export type StackFrame = {
  file: string;
  line: number;
  column: number;
  function?: string;
};

export type ParsedStackTrace = {
  allFrames: StackFrame[];
  frames: StackFrame[];
  frameTexts: string[];
  apiName: string | undefined;
};

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/common/ipc.ts#L86-L94
export type StepBeginPayload = {
  testId: string;
  stepId: string;
  parentStepId: string | undefined;
  title: string;
  category: string;
  wallTime: number; // milliseconds since unix epoch
  location?: { file: string; line: number; column: number };
};

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/common/ipc.ts#L96-L101
export type StepEndPayload = {
  testId: string;
  stepId: string;
  wallTime: number; // milliseconds since unix epoch
  error?: TestInfoError;
};

// https://github.com/microsoft/playwright/blob/a93ad3dadea86e3e1d555c5bb9c2a19458db656b/packages/playwright-core/src/client/clientInstrumentation.ts#L21-L32
// we keep some of the methods optional here because this evolves over time
export interface ClientInstrumentation {
  addListener(listener: ClientInstrumentationListener): void;
  removeListener(listener: ClientInstrumentationListener): void;
  removeAllListeners?(): void;
  onApiCallBegin(
    ...args:
      | [
          apiCall: string,
          params: Record<string, any>,
          stackTrace: ParsedStackTrace | null,
          wallTime: number,
          userData: any
        ]
      | [
          apiCall: string,
          params: Record<string, any>,
          // https://github.com/microsoft/playwright/pull/27496 changed this position from `ParsedStackTrace | null` to `StackFrame[]`
          frames: StackFrame[],
          wallTime: number,
          userData: any
        ]
      | [
          apiCall: string,
          params: Record<string, any>,
          frames: StackFrame[],
          // https://github.com/microsoft/playwright/pull/30641 removed `wallTime` at this position and added `out` at the end
          userData: any,
          out: { stepId?: string }
        ]
  ): void;
  onApiCallEnd(userData: any, error?: Error): void;
  onDidCreateBrowserContext?(context: BrowserContext): Promise<void>;
  onDidCreateRequestContext?(context: APIRequestContext): Promise<void>;
  onWillPause?(): void;
  onWillCloseBrowserContext?(context: BrowserContext): Promise<void>;
  onWillCloseRequestContext?(context: APIRequestContext): Promise<void>;
}

// https://github.com/microsoft/playwright/blob/a93ad3dadea86e3e1d555c5bb9c2a19458db656b/packages/playwright-core/src/client/clientInstrumentation.ts#L34-L42
export interface ClientInstrumentationListener {
  onApiCallBegin?(
    ...args:
      | [
          apiName: string,
          params: Record<string, any>,
          stackTrace: ParsedStackTrace | null,
          wallTime: number,
          userData: any
        ]
      | [
          apiName: string,
          params: Record<string, any>,
          // https://github.com/microsoft/playwright/pull/27496 changed this position from `ParsedStackTrace | null` to `StackFrame[]`
          frames: StackFrame[],
          wallTime: number,
          userData: any
        ]
      | [
          apiCall: string,
          params: Record<string, any>,
          frames: StackFrame[],
          // https://github.com/microsoft/playwright/pull/30641 removed `wallTime` at this position and added `out` at the end
          userData: any,
          out: { stepId?: string }
        ]
  ): void;
  onApiCallEnd?(userData: any, error?: Error): void;
  onDidCreateBrowserContext?(context: BrowserContext): Promise<void>;
  onDidCreateRequestContext?(context: APIRequestContext): Promise<void>;
  onWillPause?(): void;
  onWillCloseBrowserContext?(context: BrowserContext): Promise<void>;
  onWillCloseRequestContext?(context: APIRequestContext): Promise<void>;
}
