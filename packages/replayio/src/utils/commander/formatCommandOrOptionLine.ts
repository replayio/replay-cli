import { dim, highlight, highlightAlternate } from "../theme";

export function formatCommandOrOptionLine(line: string): string {
  line = line.replace(/ (-{1,2}[a-zA-Z0-9\-\_]+)/g, highlightAlternate(" $1"));
  line = line.replace(/ ([<\[][a-zA-Z0-9\-\_\.]+[>\]])/g, highlight(" $1"));
  line = line.replace(/\(default: ([^)]+)\)/, dim(`(default: ${highlight("$1")})`));
  return line;
}
