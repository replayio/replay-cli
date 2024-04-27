import chalk from "chalk";
import { Text } from "ink";
import { formatDuration } from "replayio";
import { FlexBox } from "../../components/FlexBox.js";
import { Table } from "../../components/Table.js";
import { Recording } from "./types.js";

export function UploadedRecordings({ recordings }: { recordings: Recording[] }) {
  if (recordings.length === 0) {
    return null;
  }

  return (
    <FlexBox direction="column">
      <Text>{"\nFinished recordings"}</Text>
      <Text dimColor>{"Click a link below to view a recording\n"}</Text>
      <Table
        gap={2}
        rows={recordings.map(recording => {
          const { duration, title } = recording;

          const url = `https://app.replay.io/recording/${recording.id}`;

          return [
            chalk.underline(title),
            chalk.dim(formatDuration(duration)),
            chalk.underline(url),
          ];
        })}
      />
    </FlexBox>
  );
}
