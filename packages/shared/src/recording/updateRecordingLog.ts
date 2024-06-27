import { appendFileSync } from "fs-extra";
import { logger } from "../logger";
import { recordingLogPath } from "./config";
import { LocalRecording, LogEntry } from "./types";

export function updateRecordingLog(
  recording: LocalRecording,
  partialEntry: Omit<LogEntry, "id" | "recordingId" | "timestamp">
) {
  logger.debug(`Updating recording log ${recordingLogPath}`);
  logger.debug(`Appending entry for recording ${recording.id}`, { partialEntry, recording });

  const entry: LogEntry = {
    ...partialEntry,
    id: recording.id,
    recordingId: recording.id,
    timestamp: Date.now(),
  };

  appendFileSync(recordingLogPath, `\n${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
  });
}
