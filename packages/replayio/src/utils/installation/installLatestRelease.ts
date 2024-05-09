import { spawnSync } from "child_process";
import { ensureDirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs-extra";
import { get } from "https";
import { join } from "path";
import { logAsyncOperation } from "../async/logAsyncOperation";
import { writeToCache } from "../cache";
import { getReplayPath } from "../getReplayPath";
import { withTrackAsyncEvent } from "../mixpanel/withTrackAsyncEvent";
import { dim, link } from "../theme";
import { metadataPath, runtimeMetadata } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { MetadataJSON } from "./types";

const MAX_DOWNLOAD_ATTEMPTS = 5;

type Result = {
  buildId: string;
  forkedVersion: string | null;
};

export const installLatestRelease = withTrackAsyncEvent(
  async function installLatestRelease(): Promise<Result | undefined> {
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

      debug("Removing previous installation at %s", runtimePath);
      rmSync(runtimePath, { force: true, recursive: true });

      ensureDirSync(runtimeBaseDir);

      debug("Writing downloaded file data to %s", downloadFilePath);
      writeFileSync(downloadFilePath, buffers);

      extractBrowserArchive(runtimeBaseDir, runtimePath);

      debug("Deleting downloaded file %s", downloadFilePath);
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
      debug("Saving release metadata to %s", metadataPath);
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
      debug("Browser installation failed: %o", error);

      progress.setFailed(
        "Something went wrong installing the Replay browser. Please try again later."
      );
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
          debug(`Download received status code ${response.statusCode}, retrying...`);
          request.destroy();
          resolve(null);
          return;
        }

        const buffers: Buffer[] = [];
        response.on("data", data => buffers.push(data));
        response.on("end", () => resolve(buffers));
      });
      request.on("error", error => {
        debug(`Download error ${error}, retrying...`);
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

async function extractBrowserArchive(runtimeBaseDir: string, downloadFilePath: string) {
  debug("Extracting archived file at %s", downloadFilePath);

  const tarResult = spawnSync("tar", ["xf", runtimeMetadata.downloadFileName], {
    cwd: runtimeBaseDir,
  });
  if (tarResult.status !== 0) {
    debug("Failed to extract", downloadFilePath);
    debug(String(tarResult.stderr));

    throw new Error("Unable to extract browser archive");
  }
}
