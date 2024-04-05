import { readdirSync, removeSync, writeFileSync } from "fs-extra";
import { join } from "path";
import { recordingLogPath, recordingsPath } from "./config";
import { debug } from "./debug";
import { getRecordings } from "./getRecordings";
import { readRecordingLogLines } from "./readRecordingLogLines";
import { LogEntry, RECORDING_LOG_KIND } from "./types";

export function removeFromDisk(id?: string) {
  if (id) {
    debug("Removing recording %s", id);

    const recordings = getRecordings();
    const recording = recordings.find(recording => recording.id.startsWith(id));
    if (recording) {
      const { metadata, path } = recording;

      metadata.sourcemaps?.forEach(path => {
        debug("Removing recording source-map file %s", path);

        removeSync(path);
      });

      // Delete recording data file
      if (path) {
        debug("Removing recording data file %s", path);

        removeSync(path);
      }

      // Remove entries from log
      const filteredLines = readRecordingLogLines().filter(text => {
        if (text) {
          try {
            const entry = JSON.parse(text) as LogEntry;
            switch (entry.kind) {
              case RECORDING_LOG_KIND.sourcemapAdded: {
                return entry.recordingId !== id;
              }
              default: {
                return entry.id !== id;
              }
            }
          } catch (error) {
            console.error("Error parsing log text:\n%s\n%s", text, error);
          }
        }
      });

      writeFileSync(recordingLogPath, filteredLines.join("\n"), "utf8");
    } else {
      console.log("Recording not found");
    }
  } else {
    debug("Removing all recordings");

    const files = readdirSync(recordingsPath);
    files.forEach(fileName => {
      if (fileName.startsWith("recording-") || fileName.startsWith("sourcemap-")) {
        removeSync(join(recordingsPath, fileName));
      }
    });
    removeSync(recordingLogPath);
  }
}
