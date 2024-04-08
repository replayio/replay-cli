import { formatDuration, formatRelativeDate } from "../date";
import { parseBuildId } from "../installation/parseBuildId";
import { dim, link } from "../theme";
import { LocalRecording } from "./types";

const MAX_TITLE_LENGTH = 35;

export function formatRecording(recording: LocalRecording) {
  const id = recording.id.substring(0, 8) + "…";

  const { runtime } = parseBuildId(recording.buildId);

  let title;
  switch (runtime) {
    case "node": {
      title = "NodeJS";
      break;
    }
    default: {
      if (recording.metadata.host) {
        if (recording.metadata.host.length > MAX_TITLE_LENGTH) {
          title = link(recording.metadata.host.substring(0, MAX_TITLE_LENGTH).trimEnd() + "…");
        } else {
          title = link(recording.metadata.host);
        }
      } else {
        title = "(untitled)";
      }
      break;
    }
  }

  const date = dim(formatRelativeDate(recording.date));
  const duration = dim(recording.duration ? formatDuration(recording.duration) : "");
  const processType = dim(
    recording.metadata.processType ? `(${recording.metadata.processType})` : ""
  );

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
