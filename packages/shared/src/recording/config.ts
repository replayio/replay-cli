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

// Added to the environment of recorders whose recordings are uploaded while they are made
export const streamedUploadRecorderEnv: Record<string, string> = streamedUploadEnabled
  ? { RECORD_REPLAY_STREAMED_UPLOAD: "1" }
  : {};

export const recordingLogPath = getReplayPath("recordings.log");

export const recordingsPath = getReplayPath();
