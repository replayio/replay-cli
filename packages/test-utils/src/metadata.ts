import { getDirectory } from "@kitchensink/replayio-replay";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { warn } from "./logging";

export function getMetadataFilePath(base: string, workerIndex = 0) {
  return (
    process.env.RECORD_REPLAY_METADATA_FILE ||
    path.join(getDirectory(), `${base.toUpperCase()}_METADATA_${workerIndex}`)
  );
}

export function initMetadataFile(path: string) {
  try {
    if (!existsSync(path)) {
      writeFileSync(path, "{}");
    }

    return path;
  } catch (e) {
    warn(`Failed to initialize metadata file${path ? ` at ${path}` : ""}`, e);
  }

  return undefined;
}
