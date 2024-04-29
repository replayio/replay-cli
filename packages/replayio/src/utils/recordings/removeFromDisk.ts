import { readdirSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra/esm";
import { join } from "path";
import { recordingLogPath, recordingsPath } from "./config.js";
import { debug } from "./debug.js";
import { getRecordings } from "./getRecordings.js";
import { readRecordingLogLines } from "./readRecordingLogLines.js";
import { LogEntry, RECORDING_LOG_KIND } from "./types.js";

export function removeFromDisk(id?: string) {
  if (id) {
    debug("Removing recording %s", id);

    const recordings = getRecordings();
    const recording = recordings.find(recording => recording.id.startsWith(id));
    if (recording) {
      const { metadata, path } = recording;

      metadata.sourceMaps.forEach(sourceMap => {
        debug("Removing recording source-map file %s", sourceMap.path);
        removeSync(sourceMap.path);

        sourceMap.originalSources.forEach(source => {
          debug("Removing recording original source file %s", source.path);
          removeSync(source.path);
        });
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
              case RECORDING_LOG_KIND.originalSourceAdded:
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
      if (/(recording|sourcemap|original)-/.test(fileName)) {
        removeSync(join(recordingsPath, fileName));
      }
    });
    removeSync(recordingLogPath);
  }
}
