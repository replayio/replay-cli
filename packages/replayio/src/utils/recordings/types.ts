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

// This data comes from the runtime
export type LogEntry = {
  buildId?: string;
  data?: any;
  driverVersion?: string;
  id: string;
  kind: RECORDING_LOG_KIND;
  metadata?: {
    argv?: string[];
    uri?: string;
  };
  path?: string;
  recordingId?: string;
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
    sourcemaps: string[] | undefined;
  };
  path: string | undefined;
  recordingStatus: "crashed" | "in-progress" | "finished" | "unusable";
  uploadStatus: "in-progress" | "finished" | undefined;
};
