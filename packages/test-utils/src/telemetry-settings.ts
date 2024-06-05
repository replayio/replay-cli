import { existsSync, writeFileSync } from "fs";
import path from "path";
import { warn } from "./logging";
import { getDirectory } from "@replayio/replay/utils";

// MBUDAYR - I'm not sure how Options work or if I should pass them in here.
// Example: packages/replay/src/auth.ts::getAuthInfoCachePath
export function getTelemetrySettingsFilePath() {
  return path.join(getDirectory(), "telemetry.json");
}

export function initTelemetrySettingsFile(path: string) {
  try {
    if (!existsSync(path)) {
      writeFileSync(path, "{}");
    }

    return path;
  } catch (e) {
    warn(`Failed to initialize telemetry settings file${path ? ` at ${path}` : ""}`, e);
  }

  return undefined;
}
