import chalk from "chalk";
import { Text } from "ink";
import { useMemo } from "react";
import strip from "strip-ansi";
import { FlexBox } from "./FlexBox.js";

type Column = {
  minSize?: number;
};

export function Table({
  columns,
  gap: gapSize = 1,
  headers,
  rows,
}: {
  columns?: Column[];
  gap?: number;
  headers?: string[];
  rows: string[][];
}) {
  const columnSizes = useMemo(() => {
    const sizes: number[] = [];

    if (columns) {
      columns.forEach((column, index) => {
        sizes[index] = column.minSize ?? 0;
      });
    }

    if (headers) {
      headers.forEach((header, index) => {
        sizes[index] = Math.max(sizes[index] ?? 0, strip(header).length);
      });
    }

    rows.forEach(row => {
      row.forEach((cell, index) => {
        sizes[index] = Math.max(sizes[index] ?? 0, strip(cell).length);
      });
    });
    return sizes;
  }, [headers, rows]);

  const gap = gapSize > 0 ? " ".repeat(gapSize) : "";

  return (
    <FlexBox direction="column">
      {headers && (
        <Text>
          {headers.map(
            (text, index) =>
              textWithPadding({ size: columnSizes[index] ?? 0, text: chalk.bold(text) }) + gap
          )}
        </Text>
      )}
      {rows.map(row => (
        <Text key={row.join()}>
          {row.map((text, index) => textWithPadding({ size: columnSizes[index] ?? 0, text }) + gap)}
        </Text>
      ))}
    </FlexBox>
  );
}

function textWithPadding({ size, text }: { size: number; text: string }) {
  return `${text}${" ".repeat(size - strip(text).length)}`;
}
