import chalk from "chalk";
import { Text } from "ink";
import { formatDuration } from "replayio";
import { FlexBox } from "../../components/FlexBox.js";
import { Table } from "../../components/Table.js";
import { Recording } from "./types.js";

export function DraftRecordings({ recordings }: { recordings: Recording[] }) {
  return (
    <FlexBox direction="column">
      <Text>Draft recordings</Text>
      {recordings.length === 0 ? (
        <Text dimColor>Open a website to make a new recording</Text>
      ) : (
        <Table
          gap={2}
          rows={recordings.map(recording => {
            const { duration, status, title } = recording;

            return [chalk.underline(title), chalk.dim(formatDuration(duration)), chalk.dim(status)];
          })}
        />
      )}
    </FlexBox>
  );
}
