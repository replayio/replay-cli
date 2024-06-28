import { spawnSync } from "child_process";
import { ensureDirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs-extra";
import { get } from "https";
import { join } from "node:path";
import { writeToCache } from "../cache";
import { getReplayPath } from "../getReplayPath";
import { logger } from "../logger";
import { dim, link } from "../theme";
import { metadataPath, runtimeBasePath, runtimeMetadata } from "./config";
import { getLatestRuntimeRelease } from "./getLatestRuntimeRelease";
import { MetadataJSON } from "./types";

const MAX_DOWNLOAD_ATTEMPTS = 5;

type Result = {
  buildId: string;
  forkedVersion: string | null;
};

// TODO [PRO-711] Add Mixpanel tracking
// TODO [PRO-712] Add Mixpanel tracking
export async function installLatestRuntimeRelease(): Promise<Result | undefined> {
  const runtimePath = getReplayPath("runtimes", runtimeMetadata.destinationName);
  const downloadFilePath = getReplayPath("runtimes", runtimeMetadata.downloadFileName);

  // TODO [PRO-711]
  // TODO [PRO-712] Add Mixpanel tracking
  // const progress = logAsyncOperation(getPendingDownloadMessage(0));

  try {
    const buffers = await downloadReplayFile({
      onRetry: attempt => {
        // TODO [PRO-711]
        // TODO [PRO-712] Add Mixpanel tracking "progress"
      },
    });

    // TODO [PRO-711]
    // TODO [PRO-712] Add Mixpanel tracking "pending"

    logger.debug(`Removing previous installation at ${runtimePath}`);
    rmSync(runtimePath, { force: true, recursive: true });

    ensureDirSync(runtimeBasePath);

    logger.debug(`Writing downloaded file data to ${downloadFilePath}`);
    writeFileSync(downloadFilePath, buffers);

    extractBrowserArchive(runtimeBasePath, runtimePath);

    logger.debug(`Deleting downloaded file ${downloadFilePath}`);
    unlinkSync(downloadFilePath);

    // This seems unnecessary, but we've always done it (and changing it would break legacy CLI compat)
    // github.com/replayio/replay-cli/commit/6d9b8b95a3a55eb9a0aa0721199242cfaf319356#r140402329
    // github.com/replayio/recordings-cli/commit/e961515bf6e6662fdce1cb76fb225e92f2b8517f
    if (runtimeMetadata.sourceName !== runtimeMetadata.destinationName) {
      renameSync(
        join(runtimeBasePath, runtimeMetadata.sourceName),
        join(runtimeBasePath, runtimeMetadata.destinationName)
      );
    }

    const latestRelease = await getLatestRuntimeRelease();
    const latestBuildId = latestRelease.buildId;
    const latestVersion = latestRelease.version;

    // Write version metadata to disk so we can compare against the latest release and prompt to update
    logger.debug(`Saving release metadata to ${metadataPath}`);
    writeToCache<MetadataJSON>(metadataPath, {
      chromium: {
        buildId: latestBuildId,
        forkedVersion: latestVersion,
        installDate: new Date().toISOString(),
      },
    });

    // TODO [PRO-711]
    // TODO [PRO-712] Add Mixpanel tracking "success"

    return {
      buildId: latestBuildId,
      forkedVersion: latestVersion,
    };
  } catch (error) {
    logger.debug("Browser installation failed", { error });

    // TODO [PRO-711]
    // TODO [PRO-712] Add Mixpanel tracking "failed"
  }
}

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

    const buffers = await new Promise<Buffer[] | null>(resolve => {
      const request = get(options, response => {
        if (response.statusCode != 200) {
          logger.debug(`Download received status code ${response.statusCode}, retrying...`);
          request.destroy();
          resolve(null);
          return;
        }

        const buffers: Buffer[] = [];
        response.on("data", data => buffers.push(data));
        response.on("end", () => resolve(buffers));
      });
      request.on("error", error => {
        logger.debug("Download error; retrying ...", { error });
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

async function extractBrowserArchive(runtimeBasePath: string, downloadFilePath: string) {
  logger.debug(`Extracting archived file at ${downloadFilePath}`);

  const tarResult = spawnSync("tar", ["xf", runtimeMetadata.downloadFileName], {
    cwd: runtimeBasePath,
  });
  if (tarResult.status !== 0) {
    logger.debug(`Failed to extract ${downloadFilePath}`, { stderr: String(tarResult.stderr) });

    throw new Error("Unable to extract browser archive");
  }
}
