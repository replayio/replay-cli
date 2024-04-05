import { writeFileSync } from "fs-extra";
import { recordingLogPath } from "./config";
import { debug } from "./debug";
import { readRecordingLogLines } from "./readRecordingLogLines";
import { LogEntry } from "./types";

export function updateRecordingLog(entry: LogEntry) {
  debug("Updating recording log %s", recordingLogPath);
  debug("Appending new entry:\n%s", entry);

  const rawTextLines = readRecordingLogLines();

  writeFileSync(recordingLogPath, `${rawTextLines.join("\n")}\n${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
  });
}
