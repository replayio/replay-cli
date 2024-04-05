import chalk from "chalk";
import { replayAppHost } from "../../config";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

export function printViewRecordingLinks(recordings: LocalRecording[]) {
  if (recordings.length > 0) {
    console.log("View recording(s) at:");

    for (const recording of recordings) {
      const { id, title } = formatRecording(recording);

      const url = `${replayAppHost}/recording/${recording.id}`;

      console.log(`${title} (${id}): ${chalk.blueBright.underline(url)}`);
    }
  }
}
