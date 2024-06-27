// TODO [PRO-720] Consolidate with code in @replay-cli/shared/src/runtime

import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { emphasize } from "@replay-cli/shared/theme";
import { homedir } from "os";
import { join } from "path";
import { Architecture, Platform, Runtime } from "./types";

type Metadata = {
  architecture: Architecture;
  crashpadDirectory: string | undefined;
  destinationName: string;
  downloadFileName: string;
  path: string[];
  platform: Platform;
  runtime: Runtime;
  sourceName: string;
};

export let runtimeMetadata: Metadata;

const architecture: Architecture = process.arch.startsWith("arm") ? "arm" : "x86_64";

switch (process.platform) {
  case "darwin":
    runtimeMetadata = {
      architecture,
      crashpadDirectory: join(
        homedir(),
        "Library",
        "Application Support",
        "Chromium",
        "Crashpad",
        "pending"
      ),
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
      architecture,
      crashpadDirectory: undefined,
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
    if (process.env.REPLAY_WINDOWS_CHROMIUM_OVERRIDE) {
      // Force override for Replay internal testing purposes
      runtimeMetadata = {
        architecture,
        crashpadDirectory: undefined,
        destinationName: "replay-chromium",
        downloadFileName:
          process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE || "windows-replay-chromium.zip",
        path: ["replay-chromium", "chrome.exe"],
        platform: "windows",
        runtime: "chromium",
        sourceName: "replay-chromium",
      };
    } else {
      console.log("");
      console.log(emphasize("Replay does not support Windows at this time."));
      console.log("Please use the Windows Subsystem for Linux (WSL) instead.");
      process.exit(1);
    }
    break;
  default: {
    throw Error(`Unsupported platform "${process.platform}"`);
  }
}

export const runtimePath = getReplayPath("runtimes");
export const metadataPath = getReplayPath("runtimes", "metadata.json");
