import assert from "assert/strict";
import { existsSync } from "fs";
import { join, resolve } from "path";

function getDestinationName() {
  switch (process.platform) {
    case "darwin":
      return "Replay-Chromium.app";
    case "linux":
      return "chrome-linux";
    case "win32":
      if (process.env.REPLAY_WINDOWS_CHROMIUM_OVERRIDE) {
        return "replay-chromium";
      }
      throw new Error(
        "Replay does not support Windows at this time. Please use the Windows Subsystem for Linux (WSL) instead."
      );
    default:
      throw Error(`Unsupported platform "${process.platform}"`);
  }
}

function getReplayPath(...path: string[]) {
  let basePath;
  if (process.env.RECORD_REPLAY_DIRECTORY) {
    basePath = process.env.RECORD_REPLAY_DIRECTORY;
  } else {
    const homeDirectory = process.env.HOME || process.env.USERPROFILE;
    assert(homeDirectory, "HOME or USERPROFILE environment variable must be set");

    basePath = join(homeDirectory, ".replay");
  }

  return resolve(join(basePath, ...path));
}

export function assertBrowserInstalled() {
  const browserPath = join(getReplayPath("runtimes"), getDestinationName());
  if (!existsSync(browserPath)) {
    throw new Error(
      `Replay browser is not available at ${browserPath}. Please run \`npx replay install\`.`
    );
  }
}
