import { getReplayPath } from "@replay-cli/shared/getReplayPath";

export const debugLogPath = getReplayPath(
  "logs",
  "cli-" +
    new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\.(\d+)Z$/, "-$1.log")
);

export const multiPartChunkSize = process.env.REPLAY_MULTIPART_UPLOAD_CHUNK
  ? parseInt(process.env.REPLAY_MULTIPART_UPLOAD_CHUNK, 10)
  : undefined;
export const multiPartMinSizeThreshold = 5 * 1024 * 1024;

export const recordingLogPath = getReplayPath("recordings.log");

export const recordingsPath = getReplayPath();
