import { LocalRecording } from "replayio";
import { RecordingStatus } from "./types.js";

export function getRecordingStatus(localRecording: LocalRecording): RecordingStatus {
  if (localRecording.uploadStatus) {
    switch (localRecording.uploadStatus) {
      case "failed":
        return "uploading-failed";
      case "uploaded":
        return "uploaded";
      case "uploading":
        return "uploading";
    }
  }

  switch (localRecording.recordingStatus) {
    case "finished":
      return "recorded";
    case "recording":
      return "recording";
    default:
      return "recording-failed";
  }
}
