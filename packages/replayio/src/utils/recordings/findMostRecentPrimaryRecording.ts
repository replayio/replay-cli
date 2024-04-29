import { LocalRecording } from "./types.js";

export function findMostRecentPrimaryRecording(
  recordings: LocalRecording[]
): LocalRecording | undefined {
  const cloned = [...recordings];
  cloned.sort((a, b) => b.date.getTime() - a.date.getTime());
  return cloned.find(
    recording =>
      recording.uploadStatus === undefined &&
      (recording.metadata.processType === undefined || recording.metadata.processType === "root")
  );
}
