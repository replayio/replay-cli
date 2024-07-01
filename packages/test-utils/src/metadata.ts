import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { existsSync, writeFileSync } from "fs";
import { warn } from "./logging";
import { logger } from "@replay-cli/shared/logger";

export function getMetadataFilePath(base: string, workerIndex = 0) {
  return (
    process.env.RECORD_REPLAY_METADATA_FILE ||
    getReplayPath(`${base.toUpperCase()}_METADATA_${workerIndex}`)
  );
}

export function initMetadataFile(path: string) {
  try {
    if (!existsSync(path)) {
      writeFileSync(path, "{}");
    }

    return path;
  } catch (error) {
    warn(`Failed to initialize metadata file${path ? ` at ${path}` : ""}`, error);
    logger.error("InitMetadataFile:Failed", {
      path,
      error,
    });
  }

  return undefined;
}
