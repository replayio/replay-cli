import chalk from "chalk";
import { formatDuration, formatRelativeDate } from "../date";
import { printTable } from "../table";
import { LocalRecording } from "./types";

export function printRecordings(
  recordings: LocalRecording[],
  formattingOptions: {
    showHeaderRow?: boolean;
  } = {}
) {
  const { showHeaderRow = true } = formattingOptions;

  let text = printTable(
    recordings.map(recording => {
      const columns = [];
      columns.push(recording.id.substring(0, 8) + "…");
      columns.push(chalk.blueBright.underline(recording.metadata.host ?? ""));
      columns.push(chalk.dim(formatRelativeDate(recording.date)));
      columns.push(chalk.dim(recording.duration ? formatDuration(recording.duration) : ""));

      let status;
      if (recording.uploadStatus) {
        switch (recording.uploadStatus) {
          case "in-progress":
            status = "Uploading";
            break;
          case "finished":
            status = "Uploaded";
            break;
        }
      } else {
        switch (recording.recordingStatus) {
          case "crashed":
            status = "Crashed";
          case "in-progress":
            status = "Recording";
            break;
          case "finished":
            status = "Recorded";
            break;
          case "unusable":
            status = "Unusable";
            break;
        }
      }
      columns.push(status);

      return columns;
    }),
    showHeaderRow ? ["ID", "Host", "Date", "Duration", "Status"] : undefined
  );

  return text;
}
