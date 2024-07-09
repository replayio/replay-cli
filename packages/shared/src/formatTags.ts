import StackUtils from "stack-utils";

const stackUtils = new StackUtils({ cwd: process.cwd(), internals: StackUtils.nodeInternals() });

function anonymizeStackTrace(stack: string): string {
  return stack
    .split("\n")
    .map(line => {
      const frame = stackUtils.parseLine(line);
      if (frame && frame.file) {
        const relativePath = frame.file.includes("node_modules")
          ? frame.file.substring(frame.file.indexOf("node_modules"))
          : frame.file;
        return line.replace(frame.file, relativePath);
      }
      return line;
    })
    .join("\n");
}

export type Tags = Record<string, unknown>;

export function formatTags(tags?: Tags) {
  if (!tags) {
    return;
  }

  return Object.entries(tags).reduce((result, [key, value]) => {
    if (value instanceof Error) {
      result[key] = {
        // Intentionally keeping this for any extra properties attached in `Error`
        ...(value as any),
        errorName: value.name,
        errorMessage: value.message,
        errorStack: anonymizeStackTrace(value.stack ?? ""),
      };
    } else {
      result[key] = value;
    }
    return result;
  }, {} as Record<string, unknown>);
}
