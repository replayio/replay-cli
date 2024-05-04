import chalk from "chalk";
import { formatDuration } from "replayio";
import { Table } from "../../components/Table.js";
import { Recording } from "./types.js";

export function RecordingsTable({
  recordings,
  shortLinks,
}: {
  recordings: Recording[];
  shortLinks: Record<string, string | false>;
}) {
  return (
    <Table
      gap={2}
      rows={recordings.map(recording => {
        const { duration, status, title } = recording;
        const shortLink = shortLinks[recording.id];
        if (status === "uploaded" && shortLink) {
          return [title, chalk.dim(formatDuration(duration)), chalk.underline(shortLink)];
        } else {
          return [title, chalk.dim(formatDuration(duration)), chalk.dim(status)];
        }
      })}
    />
  );
}
