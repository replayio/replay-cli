import { join } from "path";
import { getReplayPath } from "../getReplayPath";
import { runtimeMetadata } from "./config";
import { logger } from "./logger";

export const runtimePath = getReplayPath("runtimes");

export function getBrowserPath() {
  const overridePathKey = `REPLAY_CHROMIUM_EXECUTABLE_PATH`;
  const overridePath = process.env[overridePathKey];
  if (overridePath) {
    logger.debug(`Using executable override for chromium: ${overridePath}`);
    return overridePath;
  }

  return join(runtimePath, ...runtimeMetadata.path);
}
