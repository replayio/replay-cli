import { getReplayPath } from "../getReplayPath.js";
import { Platform, Runtime } from "./types.js";

type Metadata = {
  destinationName: string;
  downloadFileName: string;
  path: string[];
  platform: Platform;
  runtime: Runtime;
  sourceName: string;
};

export let runtimeMetadata: Metadata;

switch (process.platform) {
  case "darwin":
    runtimeMetadata = {
      destinationName: "Replay-Chromium.app",
      downloadFileName:
        process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE ||
        (process.arch.startsWith("arm")
          ? "macOS-replay-chromium-arm.tar.xz"
          : "macOS-replay-chromium.tar.xz"),
      path: ["Replay-Chromium.app", "Contents", "MacOS", "Chromium"],
      platform: "macOS",
      runtime: "chromium",
      sourceName: "Replay-Chromium.app",
    };
    break;
  case "linux":
    runtimeMetadata = {
      destinationName: "chrome-linux",
      downloadFileName:
        process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE || "linux-replay-chromium.tar.xz",
      path: ["chrome-linux", "chrome"],
      platform: "linux",
      runtime: "chromium",
      sourceName: "replay-chromium",
    };
    break;
  case "win32":
    runtimeMetadata = {
      destinationName: "replay-chromium",
      downloadFileName:
        process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE || "windows-replay-chromium.zip",
      path: ["replay-chromium", "chrome.exe"],
      platform: "windows",
      runtime: "chromium",
      sourceName: "replay-chromium",
    };
    break;
  default: {
    throw Error(`Unsupported platform "${process.platform}"`);
  }
}

export const runtimePath = getReplayPath("runtimes");
export const metadataPath = getReplayPath("runtimes", "metadata.json");
