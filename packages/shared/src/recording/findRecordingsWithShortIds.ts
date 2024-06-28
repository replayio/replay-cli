import assert from "node:assert/strict";
import { LocalRecording } from "./types";

export function findRecordingsWithShortIds(
  recordings: LocalRecording[],
  shortIds: string[]
): LocalRecording[] {
  // TODO [PRO-*] Log a warning for any ids that couldn't be found?

  return shortIds.map(shortId => {
    const recording = recordings.find(recording => recording.id.startsWith(shortId));
    assert(recording, `Recording with ID "${shortId}" not found`);
    return recording;
  });
}
