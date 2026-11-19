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
      // Without a host it may be an empty tab (see `getRecordings`)
      if (!streamedUpload || !recording.metadata.host) {
        return false;
      }
      break;
    default:
      return false;
  }

  return !!recording.path && recording.uploadStatus === undefined;
}
