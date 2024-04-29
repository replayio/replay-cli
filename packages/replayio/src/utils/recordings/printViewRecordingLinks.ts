import strip from "strip-ansi";
import { replayAppHost } from "../../config.js";
import { link } from "../theme.js";
import { formatRecording } from "./formatRecording.js";
import { LocalRecording } from "./types.js";

export function printViewRecordingLinks(recordings: LocalRecording[]) {
  switch (recordings.length) {
    case 0: {
      break;
    }
    case 1: {
      const recording = recordings[0];
      const url = `${replayAppHost}/recording/${recording.id}`;

      console.log("View recording at:");
      console.log(link(url));
      break;
    }
    default: {
      console.log("View recording(s) at:");

      for (const recording of recordings) {
        const { processType, title } = formatRecording(recording);

        const url = `${replayAppHost}/recording/${recording.id}`;

        const formatted = processType ? `${title} ${processType}` : title;

        let text = `${formatted}: ${link(url)}`;
        if (strip(text).length > process.stdout.columns) {
          text = `${formatted}:\n${link(url)}`;
        }

        console.log(text);
      }
      break;
    }
  }
}
