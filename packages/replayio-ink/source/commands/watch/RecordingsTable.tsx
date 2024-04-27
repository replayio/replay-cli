import chalk from "chalk";
import { formatDuration } from "replayio";
import { Table } from "../../components/Table.js";
import { Recording } from "./types.js";

export function RecordingsTable({ recordings }: { recordings: Recording[] }) {
  return (
    <Table
      gap={2}
      rows={recordings.map(recording => {
        const { duration, id, status, title } = recording;

        if (status === "uploaded") {
          const url = `app.replay.io/recording/${id}`;

          return [title, chalk.dim(formatDuration(duration)), chalk.underline(url)];
        } else {
          return [title, chalk.dim(formatDuration(duration)), chalk.dim(status)];
        }
      })}
    />
  );
}
