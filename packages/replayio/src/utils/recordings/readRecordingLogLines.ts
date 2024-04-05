import { readFileSync } from "fs-extra";
import { recordingLogPath } from "./config";

export function readRecordingLogLines() {
  const rawText = readFileSync(recordingLogPath, "utf8");
  return rawText
    .replace(/\}\{/g, "}\n{")
    .split(/[\n\r]+/)
    .map(text => text.trim())
    .filter(Boolean);
}
