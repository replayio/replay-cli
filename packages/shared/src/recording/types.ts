export type UnstructuredMetadata = Record<string, unknown>;

export interface OriginalSourceEntry {
  path: string;
  parentOffset: number;
}

export interface SourceMapEntry {
  id: string;
  path: string;
  baseURL: string;
  targetContentHash?: string;
  targetURLHash?: string;
  targetMapURLHash: string;
  originalSources: OriginalSourceEntry[];
}

export interface RecordingEntry<TMetadata extends UnstructuredMetadata = UnstructuredMetadata> {
  id: string;
  createTime: Date;
  runtime: string;
  metadata: TMetadata;
  sourcemaps: SourceMapEntry[];
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
}
