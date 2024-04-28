import chalk from "chalk";
import { formatDuration } from "replayio";
import { Table } from "../../components/Table.js";
import { BASE_URL } from "../../constants.js";
import { Recording } from "./types.js";

export function RecordingsTable({ recordings }: { recordings: Recording[] }) {
  return (
    <Table
      gap={2}
      rows={recordings.map(recording => {
        const { duration, shortId, status, title } = recording;

        if (status === "uploaded") {
          const url = `${BASE_URL}/${shortId}`;

          return [title, chalk.dim(formatDuration(duration)), chalk.underline(url)];
        } else {
          return [title, chalk.dim(formatDuration(duration)), chalk.dim(status)];
        }
      })}
    />
  );
}
