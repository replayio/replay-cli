// Types imported from playwright and used by our fixture

import type {
  APIRequestContext,
  BrowserContext,
  TestInfo,
  TestInfoError,
  Location,
} from "@playwright/test";

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L54
export interface TestInfoImpl extends TestInfo {
  // https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L245
  _addStep: (
    data: Omit<TestStepInternal, "complete" | "stepId" | "steps" | "attachmentIndices" | "info">,
    parentStep?: TestStepInternal
  ) => TestStepInternal;
  // https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L55
  _onStepBegin: (step: StepBeginPayload) => void;
  // https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L56
  _onStepEnd: (step: StepEndPayload) => void;
  // https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L395-L398
  _currentHookType: () => "beforeEach" | "afterEach" | "beforeAll" | "afterAll" | undefined;
}

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/common/ipc.ts#L85
export type TestInfoErrorImpl = TestInfoError;

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L36-L52
export interface TestStepInternal {
  complete(result: { error?: Error | unknown; suggestedRebaseline?: string }): void;
  info: {
    // https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/worker/testInfo.ts#L507
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

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/protocol/src/channels.d.ts#L140-L145
export type StackFrame = {
  file: string;
  line: number;
  column: number;
  function?: string;
};

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/common/ipc.ts#L98-L106
export type StepBeginPayload = {
  testId: string;
  stepId: string;
  parentStepId: string | undefined;
  title: string;
  category: string;
  wallTime: number; // milliseconds since unix epoch
  location?: { file: string; line: number; column: number };
};

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright/src/common/ipc.ts#L108-L115
export type StepEndPayload = {
  testId: string;
  stepId: string;
  wallTime: number; // milliseconds since unix epoch
  error?: TestInfoErrorImpl;
  suggestedRebaseline?: string;
  annotations: { type: string; description?: string }[];
};

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright-core/src/client/clientInstrumentation.ts#L22-L29
export interface ApiCallData {
  apiName: string;
  params?: Record<string, any>;
  frames: StackFrame[];
  userData: any;
  stepId?: string;
  error?: Error;
}

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright-core/src/client/clientInstrumentation.ts#L31-L43
export interface ClientInstrumentation {
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

// https://github.com/microsoft/playwright/blob/1a595e1562db4418e0012a42ab8d2e47e90eedf3/packages/playwright-core/src/client/clientInstrumentation.ts#L45-L53
export interface ClientInstrumentationListener {
  onApiCallBegin?(apiCall: ApiCallData): void;
  onApiCallEnd?(apiCall: ApiCallData): void;
  onWillPause?(options: { keepTestTimeout: boolean }): void;

  runAfterCreateBrowserContext?(context: BrowserContext): Promise<void>;
  runAfterCreateRequestContext?(context: APIRequestContext): Promise<void>;
  runBeforeCloseBrowserContext?(context: BrowserContext): Promise<void>;
  runBeforeCloseRequestContext?(context: APIRequestContext): Promise<void>;
}
