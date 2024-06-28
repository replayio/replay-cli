import { SourceMap, UnstructuredMetadata } from "@replay-cli/shared/recording/types";

// TODO [PRO-720] Delete this type.
export type RecordingEntry<TMetadata extends UnstructuredMetadata = UnstructuredMetadata> = {
  id: string;
  createTime: Date;
  runtime: string;
  metadata: TMetadata;
  sourcemaps: SourceMap[];
  buildId?: string;
  status:
    | "onDisk"
    | "unknown"
    | "uploaded"
    | "crashed"
    | "startedWrite"
    | "startedUpload"
    | "crashUploaded"
    | "unusable";
  path?: string;
  server?: string;
  recordingId?: string;
  crashData?: any[];
  unusableReason?: string;
};
