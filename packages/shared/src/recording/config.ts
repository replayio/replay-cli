import { getReplayPath } from "../getReplayPath";

export const multiPartChunkSize = process.env.REPLAY_MULTIPART_UPLOAD_CHUNK
  ? parseInt(process.env.REPLAY_MULTIPART_UPLOAD_CHUNK, 10)
  : undefined;
export const multiPartMinSizeThreshold = 5 * 1024 * 1024;

export const recordingLogPath = getReplayPath("recordings.log");

export const recordingsPath = getReplayPath();
