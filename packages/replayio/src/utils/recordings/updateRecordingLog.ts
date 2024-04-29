import { writeFileSync } from "fs";
import { recordingLogPath } from "./config.js";
import { debug } from "./debug.js";
import { readRecordingLogLines } from "./readRecordingLogLines.js";
import { LocalRecording, LogEntry } from "./types.js";

export function updateRecordingLog(
  recording: LocalRecording,
  partialEntry: Omit<LogEntry, "id" | "recordingId" | "timestamp">
) {
  debug("Updating recording log %s", recordingLogPath);
  debug("Appending entry for recording %s:\n%s", recording.id, partialEntry);

  const entry: LogEntry = {
    ...partialEntry,
    id: recording.id,
    recordingId: recording.id,
    timestamp: Date.now(),
  };

  const rawTextLines = readRecordingLogLines();

  writeFileSync(recordingLogPath, `${rawTextLines.join("\n")}\n${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
  });
}
