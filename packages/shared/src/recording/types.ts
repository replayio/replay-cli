export enum RECORDING_LOG_KIND {
  addMetadata = "addMetadata",
  crashData = "crashData",
  crashed = "crashed",
  crashUploaded = "crashUploaded",
  createRecording = "createRecording",
  originalSourceAdded = "originalSourceAdded",
  processingFailed = "processingFailed",
  processingFinished = "processingFinished",
  processingStarted = "processingStarted",
  recordingUnusable = "recordingUnusable",
  sourcemapAdded = "sourcemapAdded",
  uploadFailed = "uploadFailed",
  uploadFinished = "uploadFinished",
  uploadStarted = "uploadStarted",
  writeFinished = "writeFinished",
  writeStarted = "writeStarted",
}

export type ProcessType = "devtools" | "extension" | "iframe" | "root";

// This data primarily comes from the runtime
// The CLI adds some entries as well, based on upload status
export type LogEntry = {
  baseURL?: string;
  buildId?: string;
  data?: any;
  driverVersion?: string;
  id: string;
  kind: RECORDING_LOG_KIND;
  metadata?: {
    argv?: string[];
    process?: ProcessType;
    processGroupId?: string;
    title?: string;
    uri?: string;
    [key: string]: unknown;
  };
  parentId?: string;
  parentOffset?: number;
  path?: string;
  reason?: string;
  recordingId?: string;
  server?: string;
  targetContentHash?: string;
  targetMapURLHash?: string;
  targetURLHash?: string;
  timestamp: number;
};

export type OriginalSource = {
  path: string;
  parentOffset: number;
};

export type SourceMap = {
  baseURL: string;
  id: string;
  originalSources: OriginalSource[];
  path: string;
  targetContentHash?: string;
  targetMapURLHash: string;
  targetURLHash?: string;
};

export type UnstructuredMetadata = Record<string, unknown>;

// TODO [PRO-720] Unify this type with the RecordingEntry type below;
// "replayio" uses LocalRecording and "test-utils" uses RecordingEntry
// but they are both describing the same data
export type LocalRecording = {
  buildId: string;
  crashData: any[] | undefined;
  date: Date;
  driverVersion: string;
  duration: number | undefined;
  id: string;
  metadata: {
    argv?: string[] | undefined;
    host: string | undefined;
    processGroupId: string | undefined;
    processType: ProcessType | undefined;
    sourceMaps: SourceMap[];
    title: string | undefined;
    uri: string | undefined;
    [key: string]: unknown;
  };
  path: string | undefined;
  processingStatus: "failed" | "processed" | "processing" | undefined;
  recordingStatus: "crashed" | "finished" | "recording" | "unusable";
  unusableReason: string | undefined;
  uploadError: Error | undefined;
  uploadStatus: "failed" | "uploading" | "uploaded" | undefined;
};
