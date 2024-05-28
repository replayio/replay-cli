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
