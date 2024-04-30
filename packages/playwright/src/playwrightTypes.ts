// Types imported from playwright and used by our fixture

import { APIRequestContext, BrowserContext, TestInfo } from "@playwright/test";

export interface TestInfoInternal extends TestInfo {
  _addStep?: (data: any, parentStep: any) => TestInfoStep;
  _onStepEnd?: (step: {
    testId: string;
    stepId: string;
    wallTime: number;
    error?: {
      message: string;
      stack: string;
    };
  }) => void;
}

export interface TestInfoStep {
  stepId: string;
  location: StackFrame;
  category: string;
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

export interface ClientInstrumentationListener {
  onApiCallBegin?(
    apiCall: string,
    params: Record<string, any>,
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
