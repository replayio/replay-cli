import { table } from "table";
import { emphasize } from "./theme.js";

export function printTable({
  headers,
  rows,
}: {
  headers?: string[] | undefined;
  rows: unknown[][];
}) {
  const data = headers ? [headers.map(text => emphasize(text)), ...rows] : rows;

  return table(data, {
    drawHorizontalLine: () => false,
    drawVerticalLine: () => false,
  });
}
