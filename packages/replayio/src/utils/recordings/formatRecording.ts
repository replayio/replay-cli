import { formatDuration, formatRelativeDate } from "../date";
import { parseBuildId } from "../installation/parseBuildId";
import { dim, link, transparent } from "../theme";
import { LocalRecording } from "./types";

const MAX_TITLE_LENGTH = 35;

export function formatRecording(recording: LocalRecording) {
  const { buildId, metadata, recordingStatus, uploadStatus } = recording;

  const { runtime } = parseBuildId(buildId);

  const category =
    metadata.processType === undefined || metadata.processType === "root" ? "primary" : "secondary";

  let id = recording.id.substring(0, 8) + "…";

  let title;
  switch (runtime) {
    case "node": {
      title = "NodeJS";
      break;
    }
    default: {
      if (metadata.host) {
        if (metadata.host.length > MAX_TITLE_LENGTH) {
          title = link(metadata.host.substring(0, MAX_TITLE_LENGTH).trimEnd() + "…");
        } else {
          title = link(metadata.host);
        }
      } else {
        title = "(untitled)";
      }
      break;
    }
  }

  let date = dim(formatRelativeDate(recording.date));
  let duration = dim(recording.duration ? formatDuration(recording.duration) : "");
  let processType = dim(metadata.processType ? metadata.processType : "");

  let status;
  if (uploadStatus) {
    switch (uploadStatus) {
      case "uploaded":
        status = "Uploaded";
        break;
      case "uploading":
        status = "Uploading";
        break;
    }
  } else {
    switch (recordingStatus) {
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

  switch (category) {
    case "primary": {
      break;
    }
    case "secondary": {
      id = `${dim("↘")} ${id}`;
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
