import chalk from "chalk";
import { table } from "table";

export function printTable(rows: unknown[][], headers?: string[]) {
  const data = headers ? [headers.map(text => chalk.bold(text)), ...rows] : rows;

  return table(data, {
    drawHorizontalLine: () => false,
    drawVerticalLine: () => false,
  });
}
