import chalk from "chalk";
import { formatDuration, formatRelativeDate } from "../date";
import { LocalRecording } from "./types";

const MAX_TITLE_LENGTH = 35;

export function formatRecording(recording: LocalRecording) {
  const id = recording.id.substring(0, 8) + "…";

  let title;
  if (recording.metadata.host) {
    if (recording.metadata.host.length > MAX_TITLE_LENGTH) {
      title = chalk.blueBright.underline(
        recording.metadata.host.substring(0, MAX_TITLE_LENGTH) + "…"
      );
    } else {
      title = chalk.blueBright.underline(recording.metadata.host);
    }
  } else {
    title = "(untitled)";
  }

  const date = chalk.gray(formatRelativeDate(recording.date));
  const duration = chalk.gray(recording.duration ? formatDuration(recording.duration) : "");
  const processType = recording.metadata.processType
    ? chalk.gray(`(${recording.metadata.processType})`)
    : "";

  let status;

  switch (recording.processingStatus) {
    case "processed":
      status = "Uploaded, processed";
      break;
    case "processing":
      status = "Processing";
      break;
    default: {
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
      break;
    }
  }

  return {
    date,
    duration,
    id,
    processType,
    status,
    title,
  };
}
