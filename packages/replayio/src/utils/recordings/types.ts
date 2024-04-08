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

export type UnstructuredMetadata = Record<string, unknown>;

// This data primarily comes from the runtime
// The CLI adds some entries as well, based on upload status
export type LogEntry = {
  buildId?: string;
  data?: any;
  driverVersion?: string;
  id: string;
  kind: RECORDING_LOG_KIND;
  metadata?: {
    argv?: string[];
    process?: ProcessType;
    uri?: string;
    [key: string]: unknown;
  };
  path?: string;
  recordingId?: string;
  server?: string;
  timestamp: number;
};

export type LocalRecording = {
  buildId: string;
  crashData: any[] | undefined;
  date: Date;
  driverVersion: string;
  duration: number | undefined;
  id: string;
  metadata: {
    host: string | undefined;
    processType: ProcessType | undefined;
    sourcemaps: string[] | undefined;
    uri: string | undefined;
    [key: string]: unknown;
  };
  path: string | undefined;
  processingStatus: "failed" | "processed" | "processing" | "unprocessed";
  recordingStatus: "crashed" | "finished" | "recording" | "unusable";
  uploadStatus: "failed" | "uploading" | "uploaded" | undefined;
};
