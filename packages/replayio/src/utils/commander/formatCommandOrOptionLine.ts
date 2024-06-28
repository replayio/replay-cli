import { dim, highlight, highlightAlternate } from "@replay-cli/shared/theme";

export function formatCommandOrOptionLine(line: string): string {
  // drop aliases
  line = line.replace(/(^\s*[a-zA-Z]+)(\|[a-zA-Z]+)/, (_, p1, p2) => p1 + " ".repeat(p1.length));
  // highlight flags
  line = line.replace(/ (-{1,2}[a-zA-Z0-9\-\_]+)/g, highlightAlternate(" $1"));
  // highlight arguments
  line = line.replace(/ ([<\[][a-zA-Z0-9\-\_\.]+[>\]])/g, highlight(" $1"));
  // highlight default values
  line = line.replace(/\(default: ([^)]+)\)/, dim(`(default: ${highlight("$1")})`));
  return line;
}
