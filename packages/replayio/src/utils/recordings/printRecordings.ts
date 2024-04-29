import { printTable } from "../table.js";
import { formatRecording } from "./formatRecording.js";
import { LocalRecording } from "./types.js";

export function printRecordings(
  recordings: LocalRecording[],
  formattingOptions: {
    showHeaderRow?: boolean;
  } = {}
) {
  const { showHeaderRow = true } = formattingOptions;

  let text = printTable({
    headers: showHeaderRow ? ["ID", "Host", "Process", "Date", "Duration", "Status"] : undefined,
    rows: recordings.map(recording => {
      const { date, duration, id, processType, status, title } = formatRecording(recording);

      return [id, title, processType, date, duration, status];
    }),
  });

  return text;
}
