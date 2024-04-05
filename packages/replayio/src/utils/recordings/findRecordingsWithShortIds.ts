import assert from "assert";
import { LocalRecording } from "./types";

export function findRecordingsWithShortIds(
  recordings: LocalRecording[],
  shortIds: string[]
): LocalRecording[] {
  return shortIds.map(shortId => {
    const recording = recordings.find(recording => recording.id.startsWith(shortId));
    assert(recording, `Recording with ID "${shortId}" not found`);
    return recording;
  });
}
