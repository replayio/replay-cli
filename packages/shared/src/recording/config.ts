import { getReplayPath } from "../getReplayPath";
import { streamedUploadSupported } from "./upload/recordingWriter";

export const multiPartChunkSize = process.env.REPLAY_MULTIPART_UPLOAD_CHUNK
  ? parseInt(process.env.REPLAY_MULTIPART_UPLOAD_CHUNK, 10)
  : undefined;
export const multiPartMinSizeThreshold = 5 * 1024 * 1024;

export const streamedUploadEnabled =
  !!process.env.REPLAY_STREAMED_UPLOAD && streamedUploadSupported;

export function assertStreamedUploadSupported() {
  if (!streamedUploadSupported) {
    throw new Error(`Streamed upload is not supported on platform "${process.platform}"`);
  }
}

// Environment of a recorder whose recordings are uploaded while they are made
export const streamedRecorderEnv: Record<string, string> = { RECORD_REPLAY_STREAMED_UPLOAD: "1" };

// `streamedRecorderEnv` if REPLAY_STREAMED_UPLOAD enables streamed upload
export const streamedUploadRecorderEnv: Record<string, string> = streamedUploadEnabled
  ? streamedRecorderEnv
  : {};

export const recordingLogPath = getReplayPath("recordings.log");

export const recordingsPath = getReplayPath();
