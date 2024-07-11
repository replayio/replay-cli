// TODO [PRO-720] Consolidate with code in @replay-cli/shared/src/runtime

import { writeToCache } from "@replay-cli/shared/cache";
import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { logDebug, logError, logInfo } from "@replay-cli/shared/logger";
import { createAsyncFunctionWithTracking } from "@replay-cli/shared/mixpanelClient";
import { dim, link } from "@replay-cli/shared/theme";
import { spawnSync } from "child_process";
import { ensureDirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs-extra";
import { get } from "https";
import { join } from "path";
import { logAsyncOperation } from "../async/logAsyncOperation";
import { metadataPath, runtimeMetadata } from "./config";
import { getLatestRelease } from "./getLatestReleases";
import { MetadataJSON } from "./types";

const MAX_DOWNLOAD_ATTEMPTS = 5;

type Result = {
  buildId: string;
  forkedVersion: string | null;
};

export const installLatestRelease = createAsyncFunctionWithTracking(
  async function installLatestRelease(): Promise<Result | undefined> {
    logInfo("InstallLatestRelease:Start");
    const runtimeBaseDir = getReplayPath("runtimes");
    const runtimePath = getReplayPath("runtimes", runtimeMetadata.destinationName);
    const downloadFilePath = getReplayPath("runtimes", runtimeMetadata.downloadFileName);

    const progress = logAsyncOperation(getPendingDownloadMessage(0));

    try {
      const buffers = await downloadReplayFile({
        onRetry: attempt => {
          progress.setPending(getPendingDownloadMessage(attempt));
        },
      });

      progress.setPending("Processing downloaded browser archive");

      logInfo("InstallLatestRelease:RemovingPreviousInstallation", { runtimePath });
      rmSync(runtimePath, { force: true, recursive: true });

      ensureDirSync(runtimeBaseDir);

      logInfo("InstallLatestRelease:WritingDownloadFile", { downloadFilePath });
      writeFileSync(downloadFilePath, buffers);

      extractBrowserArchive(runtimeBaseDir, runtimePath);

      logInfo("InstallLatestRelease:DeletingDownloadedFile", { downloadFilePath });
      unlinkSync(downloadFilePath);

      // This seems unnecessary, but we've always done it (and changing it would break legacy CLI compat)
      // github.com/replayio/replay-cli/commit/6d9b8b95a3a55eb9a0aa0721199242cfaf319356#r140402329
      // github.com/replayio/recordings-cli/commit/e961515bf6e6662fdce1cb76fb225e92f2b8517f
      if (runtimeMetadata.sourceName !== runtimeMetadata.destinationName) {
        renameSync(
          join(runtimeBaseDir, runtimeMetadata.sourceName),
          join(runtimeBaseDir, runtimeMetadata.destinationName)
        );
      }

      const latestRelease = await getLatestRelease();
      const latestBuildId = latestRelease.buildId;
      const latestVersion = latestRelease.version;

      // Write version metadata to disk so we can compare against the latest release and prompt to update
      logInfo("InstallLatestRelease:SavingMetadata", { metadataPath });
      writeToCache<MetadataJSON>(metadataPath, {
        chromium: {
          buildId: latestBuildId,
          forkedVersion: latestVersion,
          installDate: new Date().toISOString(),
        },
      });

      progress.setSuccess("Replay browser has been updated.");

      return {
        buildId: latestBuildId,
        forkedVersion: latestVersion,
      };
    } catch (error) {
      logError("InstallLatestRelease:Failed", { error });

      progress.setFailed("Something went wrong installing the Replay browser.");
      throw error;
    }
  },
  "update.runtime.installed",
  result => ({
    buildId: result?.buildId,
    runtimeVersion: result?.forkedVersion,
  })
);

function getPendingDownloadMessage(attempt: number) {
  const prefix = `Downloading from ${link("static.replay.io")}`;

  const maxRetries = MAX_DOWNLOAD_ATTEMPTS - 1;

  let suffix = "";
  if (attempt > 0) {
    suffix = dim(`(retry ${attempt} of ${maxRetries})`);
  }

  return `${prefix}... ${suffix}`;
}

async function downloadReplayFile({ onRetry }: { onRetry?: (attempt: number) => void }) {
  const options = {
    host: "static.replay.io",
    port: 443,
    path: `/downloads/${runtimeMetadata.downloadFileName}`,
  };

  for (let i = 0; i < MAX_DOWNLOAD_ATTEMPTS; i++) {
    if (i > 0) {
      onRetry?.(i);
    }

    const buffers = await new Promise<Buffer[] | null>((resolve, reject) => {
      const request = get(options, response => {
        if (response.statusCode != 200) {
          logDebug("DownloadReplayFile:UnexpectedStatus", { statusCode: response.statusCode });
          request.destroy();
          resolve(null);
          return;
        }

        const buffers: Buffer[] = [];
        response.on("data", data => buffers.push(data));
        response.on("end", () => resolve(buffers));
      });
      request.on("error", error => {
        logDebug("DownloadReplayFile:Error", { error });
        request.destroy();
        resolve(null);
      });
    });

    if (buffers) {
      return Buffer.concat(buffers);
    }
  }

  throw new Error("Download failed, giving up");
}

function extractBrowserArchive(runtimeBaseDir: string, downloadFilePath: string) {
  logInfo(`ExtractBrowserArchive:Extracting`, { downloadFilePath });

  const tarResult = spawnSync("tar", ["xf", runtimeMetadata.downloadFileName], {
    cwd: runtimeBaseDir,
  });
  if (tarResult.status !== 0) {
    const hasXz = spawnSync("which", ["xz"]).status === 0;

    logError("ExtractBrowserArchive:Failed", {
      downloadFilePath,
      hasXz,
      stderr: String(tarResult.stderr),
    });

    let message = "Unable to extract browser archive";

    if (!hasXz) {
      message += `. xz is required to decompress it. Please install xz and try again.`;
    }

    throw new Error(message);
  }
}
