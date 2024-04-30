// Types imported from playwright and used by our fixture

import { APIRequestContext, BrowserContext, TestInfo, TestInfoError } from "@playwright/test";

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L57
export interface TestInfoInternal extends TestInfo {
  // https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/worker/testInfo.ts#L247C18-L247C22
  _addStep?: (data: Omit<TestStepInternal, "complete" | "stepId" | "steps">) => TestStepInternal;
  _onStepEnd?: (step: StepEndPayload) => void;
}

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

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright/src/common/ipc.ts#L96-L101
export type StepEndPayload = {
  testId: string;
  stepId: string;
  wallTime: number; // milliseconds since unix epoch
  error?: TestInfoError;
};

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright-core/src/client/clientInstrumentation.ts#L21-L32
// we keep some of the methods optional here because this evolves over time
export interface ClientInstrumentation {
  addListener(listener: ClientInstrumentationListener): void;
  removeListener(listener: ClientInstrumentationListener): void;
  removeAllListeners?(): void;
  onApiCallBegin(
    apiCall: string,
    params: Record<string, any>,
    // this got changed in https://github.com/microsoft/playwright/pull/27496
    stackTraceOrFrames: ParsedStackTrace | StackFrame[] | null,
    wallTime: number,
    userData: any
  ): void;
  onApiCallEnd(userData: any, error?: Error): void;
  onDidCreateBrowserContext?(context: BrowserContext): Promise<void>;
  onDidCreateRequestContext?(context: APIRequestContext): Promise<void>;
  onWillPause?(): void;
  onWillCloseBrowserContext?(context: BrowserContext): Promise<void>;
  onWillCloseRequestContext?(context: APIRequestContext): Promise<void>;
}

// https://github.com/microsoft/playwright/blob/ebafb950542c334147c642cf10d5b6077b58f61e/packages/playwright-core/src/client/clientInstrumentation.ts#L34-L42
export interface ClientInstrumentationListener {
  onApiCallBegin?(
    apiName: string,
    params: Record<string, any>,
    // this got changed in https://github.com/microsoft/playwright/pull/27496
    stackTraceOrFrames: ParsedStackTrace | StackFrame[] | null,
    wallTime: number,
    userData: any
  ): void;
  onApiCallEnd?(userData: any, error?: Error): void;
  onDidCreateBrowserContext?(context: BrowserContext): Promise<void>;
  onDidCreateRequestContext?(context: APIRequestContext): Promise<void>;
  onWillPause?(): void;
  onWillCloseBrowserContext?(context: BrowserContext): Promise<void>;
  onWillCloseRequestContext?(context: APIRequestContext): Promise<void>;
}
