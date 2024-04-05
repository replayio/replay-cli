export enum RECORDING_LOG_KIND {
  addMetadata = "addMetadata",
  crashData = "crashData",
  crashed = "crashed",
  crashUploaded = "crashUploaded",
  createRecording = "createRecording",
  originalSourceAdded = "originalSourceAdded",
  recordingUnusable = "recordingUnusable",
  sourcemapAdded = "sourcemapAdded",
  uploadFinished = "uploadFinished",
  uploadStarted = "uploadStarted",
  writeFinished = "writeFinished",
  writeStarted = "writeStarted",
}

export type UnstructuredMetadata = Record<string, unknown>;

// This data primarily comes from the runtime
// The CLI adds some entries as well, based on upload status
export type LogEntry = {
  buildId?: string;
  data?: any;
  driverVersion?: string;
  id: string;
  kind: RECORDING_LOG_KIND;
  metadata?: Object & {
    argv?: string[];
    uri?: string;
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
  metadata: Object & {
    host: string | undefined;
    uri: string | undefined;
    sourcemaps: string[] | undefined;
  };
  path: string | undefined;
  recordingStatus: "crashed" | "finished" | "recording" | "unusable";
  uploadStatus: "uploading" | "uploaded" | undefined;
};
