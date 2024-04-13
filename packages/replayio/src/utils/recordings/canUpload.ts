import { LocalRecording } from "./types";

export function canUpload(recording: LocalRecording) {
  return (
    recording.path &&
    recording.uploadStatus === undefined &&
    (recording.recordingStatus === "crashed" || recording.recordingStatus === "finished")
  );
}
