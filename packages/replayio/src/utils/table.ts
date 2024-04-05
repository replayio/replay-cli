import chalk from "chalk";
import { table } from "table";

export function printTable({
  headers,
  rows,
}: {
  headers?: string[] | undefined;
  rows: unknown[][];
}) {
  const data = headers ? [headers.map(text => chalk.bold(text)), ...rows] : rows;

  return table(data, {
    drawHorizontalLine: () => false,
    drawVerticalLine: () => false,
  });
}
