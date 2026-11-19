import { LocalRecording } from "./types";

export function canUpload(
  recording: LocalRecording,
  { streamedUpload = false }: { streamedUpload?: boolean } = {}
) {
  switch (recording.recordingStatus) {
    case "crashed":
    case "finished":
      break;
    case "recording":
      if (!streamedUpload) {
        return false;
      }
      break;
    default:
      return false;
  }

  return !!recording.path && recording.uploadStatus === undefined;
}
