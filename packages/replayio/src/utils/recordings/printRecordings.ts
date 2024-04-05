import { printTable } from "../table";
import { formatRecording } from "./formatRecording";
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
      const { date, duration, id, status, title } = formatRecording(recording);

      return [id, title, date, duration, status];
    }),
    showHeaderRow ? ["ID", "Host", "Date", "Duration", "Status"] : undefined
  );

  return text;
}
