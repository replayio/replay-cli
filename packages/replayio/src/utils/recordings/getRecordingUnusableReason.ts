import { getRecordings } from "./getRecordings";

export function getRecordingUnusableReason(processGroupIdFilter?: string) {
  // Look for the most recent unusable recording; that is most likely to be related
  return getRecordings(processGroupIdFilter).findLast(
    recording => recording.recordingStatus === "unusable" && recording.unusableReason
  )?.unusableReason;
}
