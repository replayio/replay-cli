import { readFileSync } from "fs";
import { recordingLogPath } from "./config.js";

export function readRecordingLogLines() {
  const rawText = readFileSync(recordingLogPath, "utf8");
  return rawText
    .replace(/\}\{/g, "}\n{")
    .split(/[\n\r]+/)
    .map(text => text.trim())
    .filter(Boolean);
}
