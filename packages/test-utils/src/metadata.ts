import { writeFileSync } from "fs";
import path from "path";
import { getDirectory } from "@replayio/replay/src/utils";

export function getMetadataFilePath(base: string, workerIndex = 0) {
  return (
    process.env.RECORD_REPLAY_METADATA_FILE ||
    path.join(getDirectory(), `${base.toUpperCase()}_METADATA_${workerIndex}`)
  );
}

export function initMetadataFilePath(base: string, workerIndex = 0) {
  let path = "";
  try {
    path = getMetadataFilePath(base, workerIndex);
    writeFileSync(path, "{}");

    return path;
  } catch (e) {
    console.error(`Failed to initialize metadata file${path ? ` at ${path}` : ""}`);
    console.error(e);
  }

  return undefined;
}
