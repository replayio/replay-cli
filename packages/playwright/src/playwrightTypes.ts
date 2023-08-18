// Types imported from playwright and used by our fixture

import { APIRequestContext, BrowserContext } from "@playwright/test";

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
    stackTrace: ParsedStackTrace | null,
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
