import { spawnSync } from "child_process";
import { ensureDirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs-extra";
import { get } from "https";
import { join } from "path";
import { logPromise } from "../async/logPromise";
import { timeoutAfter } from "../async/timeoutAfter";
import { writeToCache } from "../cache";
import { getReplayPath } from "../getReplayPath";
import { dim, link } from "../theme";
import { metadataPath, runtimeMetadata } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { MetadataJSON } from "./types";

export async function installLatestRelease() {
  const runtimeBaseDir = getReplayPath("runtimes");
  const runtimePath = getReplayPath("runtimes", runtimeMetadata.destinationName);
  const downloadFilePath = getReplayPath("runtimes", runtimeMetadata.downloadFileName);

  const metadata = {
    attemptNumber: 0,
  };

  const downloadPromise = downloadReplayFile(5, metadata);

  logPromise(downloadPromise, {
    messages: {
      failed: "Something went wrong installing the Replay browser. Please try again later.",
      pending: () => {
        const prefix = `Downloading from ${link("static.replay.io")}`;
        let suffix = "";
        if (metadata.attemptNumber > 1) {
          suffix = `${dim(` (retry ${metadata.attemptNumber - 1} of 4)`)}`;
        }

        return `${prefix}${suffix}...`;
      },
      success: "Replay browser has been updated.",
    },
  });

  const buffers = await downloadPromise;

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
      join(runtimePath, runtimeMetadata.sourceName),
      join(runtimePath, runtimeMetadata.destinationName)
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
}

async function downloadReplayFile(maxAttempts: number, metadata: { attemptNumber: number }) {
  const options = {
    host: "static.replay.io",
    port: 443,
    path: `/downloads/${runtimeMetadata.downloadFileName}`,
  };

  for (let i = 1; i <= maxAttempts; i++) {
    metadata.attemptNumber = i;

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
