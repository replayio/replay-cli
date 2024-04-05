import chalk from "chalk";
import strip from "strip-ansi";
import { replayAppHost } from "../../config";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

export function printViewRecordingLinks(recordings: LocalRecording[]) {
  if (recordings.length > 0) {
    console.log("View recording(s) at:");

    for (const recording of recordings) {
      const { processType, title } = formatRecording(recording);

      const url = `${replayAppHost}/recording/${recording.id}`;

      const formatted = processType ? `${title} ${processType}` : title;

      let text = `${formatted}: ${chalk.blueBright.underline(url)}`;
      if (strip(text).length > process.stdout.columns) {
        text = `${formatted}:\n${chalk.blueBright.underline(url)}`;
      }

      console.log(text);
    }
  }
}
