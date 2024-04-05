import chalk from "chalk";
import { formatDuration, formatRelativeDate } from "../date";
import { LocalRecording } from "./types";

export function formatRecording(recording: LocalRecording) {
  const id = recording.id.substring(0, 8) + "…";

  let title;
  if (recording.metadata.host) {
    title = chalk.blueBright.underline(recording.metadata.host);
  } else {
    title = "(recording)";
  }

  const date = chalk.gray(formatRelativeDate(recording.date));
  const duration = chalk.gray(recording.duration ? formatDuration(recording.duration) : "");

  let status;
  if (recording.uploadStatus) {
    switch (recording.uploadStatus) {
      case "uploaded":
        status = "Uploaded";
        break;
      case "uploading":
        status = "Uploading";
        break;
    }
  } else {
    switch (recording.recordingStatus) {
      case "crashed":
        status = "Crashed";
      case "finished":
        status = "Recorded";
        break;
      case "recording":
        status = "Recording";
        break;
      case "unusable":
        status = "Unusable";
        break;
    }
  }

  return {
    date,
    duration,
    id,
    status,
    title,
  };
}
