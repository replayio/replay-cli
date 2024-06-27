import { printTable } from "@replay-cli/shared/printTable";
import { formatRecording } from "@replay-cli/shared/recording/formatRecording";
import { LocalRecording } from "@replay-cli/shared/recording/types";

export function printRecordings(
  recordings: LocalRecording[],
  formattingOptions: {
    showHeaderRow?: boolean;
  } = {}
) {
  const { showHeaderRow = true } = formattingOptions;

  let text = printTable({
    headers: showHeaderRow ? ["ID", "Title", "Process", "Date", "Duration", "Status"] : undefined,
    rows: recordings.map(recording => {
      const { date, duration, id, processType, status, title } = formatRecording(recording);

      return [id, title, processType, date, duration, status];
    }),
  });

  return text;
}
