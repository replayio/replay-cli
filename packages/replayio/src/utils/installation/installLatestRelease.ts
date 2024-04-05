import chalk from "chalk";
import { spawnSync } from "child_process";
import { ensureDirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "fs-extra";
import { get } from "https";
import { join } from "path";
import { writeToCache } from "../cache";
import { getReplayPath } from "../getReplayPath";
import { metadataPath, runtimeMetadata } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { MetadataJSON } from "./types";

export async function installLatestRelease() {
  const runtimeBaseDir = getReplayPath("runtimes");
  const runtimePath = getReplayPath("runtimes", runtimeMetadata.destinationName);
  const downloadFilePath = getReplayPath("runtimes", runtimeMetadata.downloadFileName);

  debug("Removing previous installation at %s", runtimePath);
  rmSync(runtimePath, { force: true, recursive: true });

  const buffers = await downloadReplayFile();

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

  console.log("Download complete!");

  const latestRelease = await getLatestRelease();
  const latestBuildId = latestRelease.buildId;

  // Write version metadata to disk so we can compare against the latest release and prompt to update
  debug("Saving release metadata to %s", metadataPath);
  writeToCache<MetadataJSON>(metadataPath, {
    chromium: {
      buildId: latestBuildId,
      installDate: new Date().toISOString(),
    },
  });
}

async function downloadReplayFile() {
  const options = {
    host: "static.replay.io",
    port: 443,
    path: `/downloads/${runtimeMetadata.downloadFileName}`,
  };

  for (let i = 0; i < 5; i++) {
    console.log(
      `Downloading ${runtimeMetadata.runtime} from replay.io ${chalk.gray(
        `(attempt ${i + 1} of 5)`
      )}`
    );

    const buffers = await new Promise<Buffer[] | null>((resolve, reject) => {
      const request = get(options, response => {
        if (response.statusCode != 200) {
          console.log(`Download received status code ${response.statusCode}, retrying...`);
          request.destroy();
          resolve(null);
          return;
        }

        const buffers: Buffer[] = [];
        response.on("data", data => buffers.push(data));
        response.on("end", () => resolve(buffers));
      });
      request.on("error", error => {
        console.error(`Download error ${error}, retrying...`);
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
    console.error("Failed to extract", downloadFilePath);
    console.error(String(tarResult.stderr));

    throw new Error("Unable to extract browser archive");
  }
}
