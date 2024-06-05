import { readFileSync } from "fs-extra";
import { recordingLogPath } from "./config";
import { debug } from "./debug";
import { LogEntry } from "./types";

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
    .filter((v): v is LogEntry => !!v);
}
