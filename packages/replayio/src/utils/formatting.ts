import chalk from "chalk";
import strip from "strip-ansi";

export function drawBoxAroundText(
  text: string,
  options: {
    headerLabel?: string;
  }
) {
  const { headerLabel } = options;

  const lines = text.split("\n");
  const lineLength = lines.reduce((maxLength, line) => {
    const length = strip(line).length;
    return Math.max(maxLength, length);
  }, 0);

  if (lineLength + 2 > process.stdout.columns) {
    if (headerLabel) {
      return headerLabel ? `${chalk.dim(`${headerLabel}:`)}\n${text}` : text;
    }
  }

  let formatted: string[] = [];
  if (headerLabel) {
    const headerWithPadding = ` ${headerLabel} `;
    formatted.push(
      chalk.dim(
        `${"┌"}${headerWithPadding}${"─".repeat(lineLength - headerWithPadding.length)}${"┐"}`
      )
    );
  } else {
    formatted.push(chalk.dim(`${"┌"}${"─".repeat(lineLength)}${"┐"}`));
  }

  lines.filter(Boolean).map(line => {
    const delta = lineLength - strip(line).length;
    const padding = delta > 0 ? " ".repeat(delta) : "";
    formatted.push(`${chalk.dim("│")}${line}${padding}${chalk.dim("│")}`);
  });

  formatted.push(chalk.dim(`${"└"}${"─".repeat(lineLength)}${"┘"}`));

  return formatted.join("\n");
}
