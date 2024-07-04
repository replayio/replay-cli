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

export type UploadStatusThreshold = "all" | "failed-and-flaky" | "failed";

export type UploadAdvancedOptions = {
  /**
   * Minimize the number of recordings uploaded for a test attempt (within a shard).
   * e.g. Only one recording would be uploaded for a failing test attempt, regardless of retries.
   * e.g. Two recordings would be uploaded for a flaky test attempt (the passing test and one of the failures).
   */
  minimizeUploads?: boolean;
  statusThreshold?: UploadStatusThreshold;
};

export type UploadOption = boolean | UploadAdvancedOptions;

export interface ReplayReporterConfig<
  TRecordingMetadata extends UnstructuredMetadata = UnstructuredMetadata
> {
  runTitle?: string;
  metadata?: Record<string, any> | string;
  metadataKey?: string;
  upload?: UploadOption;
  apiKey?: string;
  /** @deprecated Use `upload.minimizeUploads` and `upload.statusThreshold` instead */
  filter?: (r: RecordingEntry<TRecordingMetadata>) => boolean;
}
