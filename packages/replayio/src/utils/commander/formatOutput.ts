import { drawBoxAroundText } from "../formatting.js";
import { highlight, highlightAlternate } from "../theme.js";
import { formatCommandOrOptionLine } from "./formatCommandOrOptionLine.js";
import { Block } from "./types.js";

export function formatOutput(originalText: string): string {
  const blocks: Block[] = [];

  let currentBlock: null | Block = null;
  let lines: string[] = [];

  originalText.split("\n").forEach(line => {
    if (currentBlock != null) {
      if (!line.trim()) {
        blocks.push(currentBlock);
        currentBlock = null;
      } else {
        currentBlock.lines.push(formatCommandOrOptionLine(line));
      }
    } else if (
      line.startsWith("Arguments:") ||
      line.startsWith("Commands:") ||
      line.startsWith("Options:")
    ) {
      currentBlock = {
        label: line.replace(":", "").trim(),
        lines: [],
      };
    } else if (line.startsWith("Usage:")) {
      line = line.replace(/ (-{1,2}[a-zA-Z0-9\-\_]+)/g, highlightAlternate(" $1"));
      line = line.replace(/ ([<\[][a-zA-Z0-9\-\_\.]+[>\]])/g, highlight(" $1"));

      lines.push(line);
    } else {
      lines.push(line);
    }
  });

  blocks.forEach(block => {
    const blockText = block.lines.map(line => `${line}  `).join("\n");
    const boxedText =
      drawBoxAroundText(blockText, {
        headerLabel: block.label,
      }) + "\n";

    lines.push(...boxedText.split("\n"));
  });

  return lines.join("\n");
}
