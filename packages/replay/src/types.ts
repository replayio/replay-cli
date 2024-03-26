import type { AgentOptions } from "http";

export type UnstructuredMetadata = Record<string, unknown>;

export interface Options {
  /**
   * Alternate recording directory
   */
  directory?: string;

  /**
   * Alternate server to upload recordings to
   */
  server?: string;

  /**
   * Alternate server to use for opening devtools
   */
  viewServer?: string;

  /**
   * Authentication API Key
   */
  apiKey?: string;
  verbose?: boolean;
  agentOptions?: AgentOptions;
}

export interface SourcemapUploadOptions {
  group: string;
  dryRun?: boolean;
  extensions?: Array<string>;
  ignore?: Array<string>;
  quiet?: boolean;
  verbose?: boolean;
  root?: string;
  batchSize?: number;
}

export interface MetadataOptions {
  init?: string;
  keys?: string[];
  warn?: boolean;
  verbose?: boolean;
  directory?: string;
}

export interface FilterOptions {
  filter?:
    | string
    | ((recordings: RecordingEntry, index: number, allRecordings: RecordingEntry[]) => boolean);
  includeCrashes?: boolean;
}

export interface LaunchOptions {
  browser?: string;
  attach?: boolean;
}

export interface ListOptions extends FilterOptions {
  all?: boolean;
}

export interface UploadOptions extends Options {
  /**
   * Fail the recording upload if any part of the upload fails.
   */
  strict?: boolean;
}

export interface UploadAllOptions extends FilterOptions, UploadOptions {
  batchSize?: number;
  warn?: boolean;
}

/**
 * Supported replay browsers
 */
export type BrowserName = "chromium" | "firefox";

export type Runner = "playwright" | "puppeteer";

export interface RecordingMetadata {
  recordingData: {
    id?: string;
    duration?: number;
    url?: string;
    title?: string;
    operations: object | null;
    lastScreenData?: string;
    lastScreenMimeType: string;
  };
  metadata: UnstructuredMetadata;
}

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

export type ExternalRecordingEntry<
  TRecordingMetadata extends UnstructuredMetadata = UnstructuredMetadata
> = Omit<RecordingEntry<TRecordingMetadata>, "buildId" | "crashData">;
