import { readFileSync } from "fs-extra";
import { recordingLogPath } from "./config";
import { debug } from "./debug";
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
  const rawText = readFileSync(recordingLogPath, "utf8");
  return rawText
    .split(/[\n\r]+/)
    .map(text => text.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch (err) {
        debug(`Error parsing line:\n${line}`);

        // Early versions of `replayio` could remove the trailing \n from recordings.log,
        // so the next entry would be appended to the last line, creating a line with two
        // entries. This workaround lets us read these corrupted entries but it should
        // be removed eventually.
        const replaced = line.replace(/\}\{/g, "}\n{");

        if (replaced.length === line.length) {
          return;
        }

        return replaced.split(/[\n\r]+/).map(splitted => {
          try {
            return JSON.parse(splitted) as LogEntry;
          } catch (err) {
            debug(`Error parsing splitted line:\n${splitted}`);
          }
        });
      }
    })
    .filter(value => !!value)
    .sort((a, b) => RECORDING_LOG_KINDS.indexOf(a.kind) - RECORDING_LOG_KINDS.indexOf(b.kind));
}
