import { readFileSync } from "fs-extra";
import { insert } from "../array";
import { logDebug } from "../logger";
import { recordingLogPath } from "./config";
import { LogEntry, RECORDING_LOG_KIND } from "./types";

const RECORDING_LOG_KINDS = [
  RECORDING_LOG_KIND.createRecording,
  RECORDING_LOG_KIND.addMetadata,
  RECORDING_LOG_KIND.writeStarted,
  RECORDING_LOG_KIND.sourcemapAdded,
  RECORDING_LOG_KIND.originalSourceAdded,
  RECORDING_LOG_KIND.writeFinished,
  RECORDING_LOG_KIND.uploadStarted,
  RECORDING_LOG_KIND.uploadFinished,
  RECORDING_LOG_KIND.uploadFailed,
  RECORDING_LOG_KIND.recordingUnusable,
  RECORDING_LOG_KIND.crashed,
  RECORDING_LOG_KIND.crashData,
  RECORDING_LOG_KIND.crashUploaded,
  RECORDING_LOG_KIND.processingStarted,
  RECORDING_LOG_KIND.processingFinished,
  RECORDING_LOG_KIND.processingFailed,
];

export function readRecordingLog() {
  const logEntries: LogEntry[] = [];

  const processLine = (line: string) => {
    line = line.trim();
    if (!line) {
      return;
    }

    const logEntry = JSON.parse(line) as LogEntry;

    insert(
      logEntries,
      logEntry,
      (a, b) => RECORDING_LOG_KINDS.indexOf(a.kind) - RECORDING_LOG_KINDS.indexOf(b.kind)
    );
  };

  const rawText = readFileSync(recordingLogPath, "utf8");
  rawText.split(/[\n\r]+/).forEach(line => {
    try {
      processLine(line);
    } catch {
      logDebug("Error parsing line", { line });

      // Early versions of `replayio` could remove the trailing \n from recordings.log,
      // so the next entry would be appended to the last line, creating a line with two entries.
      // This workaround lets us read these corrupted entries but it should be removed eventually.
      const splitLines = line.replace(/\}\{/g, "}\n{");
      if (splitLines.length === line.length) {
        return;
      }

      return splitLines.split(/[\n\r]+/).map(line => {
        try {
          processLine(line);
        } catch (error) {
          logDebug("Error parsing split line", { line });
        }
      });
    }
  });

  return logEntries;
}
