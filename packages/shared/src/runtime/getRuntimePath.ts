import { getReplayPath } from "../getReplayPath";
import { logDebug } from "../logger";
import { runtimeMetadata } from "./config";

export function getRuntimePath() {
  const overridePathKey = `REPLAY_CHROMIUM_EXECUTABLE_PATH`;
  const overridePath = process.env[overridePathKey];
  if (overridePath) {
    logDebug(`Using executable override for chromium: ${overridePath}`);
    return overridePath;
  }

  return getReplayPath("runtimes", ...runtimeMetadata.path);
}
