import strip from "strip-ansi";
import { replayAppHost } from "../../config";
import { link } from "../theme";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

export function printViewRecordingLinks(recordings: LocalRecording[]) {
  if (recordings.length > 0) {
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
  }
}
