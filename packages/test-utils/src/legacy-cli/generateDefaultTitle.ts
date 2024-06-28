import path from "path";

export function generateDefaultTitle(metadata: Record<string, unknown>) {
  let host = metadata.uri;
  if (host && typeof host === "string") {
    try {
      const url = new URL(host);
      host = url.host;
    } finally {
      return `Replay of ${host}`;
    }
  }

  if (Array.isArray(metadata.argv) && typeof metadata.argv[0] === "string") {
    return `Replay of ${path.basename(metadata.argv[0])}`;
  }
}
