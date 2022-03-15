import type { Agent } from "http";

export interface BaseOptions {
  directory?: string;
  verbose?: boolean;
}

export interface ConnectOptions extends BaseOptions {
  apiKey?: string;
  server?: string;
  agent?: Agent;
}

export type Recording = {
  id: number;
  createTime: string;
  metadata: Record<string, unknown>;
  status: string;
  runtime: string;
  path: string;
  server?: string;
  recordingId?: string;
};

/**
 * Lists all locally-stored recordings
 *
 * @param opts BaseOptions
 */
export function listAllRecordings(opts?: BaseOptions): Recording[];

/**
 * Uploads the recording.
 *
 * Returns the recording ID if successful.
 *
 * @param recordingId String
 * @param opts ConnectOptions
 * @returns String
 */
export function uploadRecording(
  recordingId: number,
  opts?: ConnectOptions
): Promise<string | null>;

/**
 * Uploads the recording (if necessary) and attempts to process the recording to
 * validate it is usable.
 *
 * Returns the recording ID if successful.
 *
 * @param recordingId String
 * @param opts ConnectOptions
 * @returns String
 */
export function processRecording(
  recordingId: number,
  opts?: ConnectOptions
): Promise<string | null>;

/**
 * Uploads all pending recordings.
 *
 * Returns `true` if all were uploaded successfully
 *
 * @param opts ConnectOptions
 * @returns Boolean
 */
export function uploadAllRecordings(opts?: ConnectOptions): Promise<boolean>;

/**
 * Uploads (if necessary) the recording and launches the default browser to view
 * it.
 *
 * Returns `true` if successful
 *
 * @param opts ConnectOptions
 * @returns Boolean
 */
export function viewRecording(
  recordingId: number,
  opts?: ConnectOptions
): Promise<boolean>;

/**
 * Uploads (if necessary) the newest recording and launches the default browser
 * to view it.
 *
 * Returns `true` if successful
 *
 * @param opts ConnectOptions
 * @returns Boolean
 */
export function viewLatestRecording(opts?: ConnectOptions): Promise<boolean>;

/**
 * Removes a local recording
 *
 * Returns `true` if successful
 *
 * @param recordingId String
 * @param opts BaseOptions
 * @returns Boolean
 */
export function removeRecording(
  recordingId: number,
  opts?: BaseOptions
): boolean;

/**
 * Removes all local recordings
 *
 * Returns `true` if successful
 *
 * @param opts BaseOptions
 * @returns Boolean
 */
export function removeAllRecordings(opts?: BaseOptions): boolean;

/**
 * Updates the playwright and puppeteer Replay browsers to the latest version
 *
 * @param opts BaseOptions
 * @returns Boolean
 */
export function updateBrowsers(opts?: BaseOptions): Promise<void>;
