// Manage installation of browsers for other NPM packages.

import { spawnSync } from "child_process";
import dbg from "./debug";
import fs from "fs";
import https from "https";
import path from "path";
import { BrowserName, Options } from "./types";
import { defer, getDirectory, maybeLog } from "./utils";

const debug = dbg("replay:cli:install");

type PlatformKeys = `${typeof process.platform}:${BrowserName}`;

const EXECUTABLE_PATHS: Partial<Record<PlatformKeys, string[]>> = {
  "darwin:firefox": ["firefox", "Nightly.app", "Contents", "MacOS", "firefox"],
  "darwin:chromium": ["Replay-Chromium.app", "Contents", "MacOS", "Chromium"],
  "linux:chromium": ["chrome-linux", "chrome"],
  "linux:firefox": ["firefox", "firefox"],
  "win32:chromium": ["replay-chromium", "chrome.exe"],
};

function getBrowserDownloadFileName<K extends keyof typeof EXECUTABLE_PATHS>(key: K): string {
  switch (key) {
    case "darwin:firefox":
      return process.env.RECORD_REPLAY_FIREFOX_DOWNLOAD_FILE || "macOS-replay-playwright.tar.xz";
    case "darwin:chromium":
      return (
        process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE ||
        (process.arch.startsWith("arm")
          ? "macOS-replay-chromium-arm.tar.xz"
          : "macOS-replay-chromium.tar.xz")
      );

    case "linux:chromium":
      return process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE || "linux-replay-chromium.tar.xz";
    case "linux:firefox":
      return process.env.RECORD_REPLAY_FIREFOX_DOWNLOAD_FILE || "linux-replay-playwright.tar.xz";

    case "win32:chromium":
      return process.env.RECORD_REPLAY_CHROMIUM_DOWNLOAD_FILE || "windows-replay-chromium.zip";
  }

  throw new Error("Unexpected platform");
}

async function ensureBrowsersInstalled(
  kind: BrowserName | "all",
  force: boolean,
  opts: Options = {}
) {
  maybeLog(
    opts.verbose,
    `Installing ${kind === "all" ? "browsers" : kind} for ${process.platform}`
  );
  if (kind !== "all" && !getPlatformKey(kind)) {
    console.log(`${kind} browser for Replay is not supported on ${process.platform}`);
    return;
  }

  switch (process.platform) {
    case "darwin":
      if (["all", "firefox"].includes(kind)) {
        await installReplayBrowser(
          getBrowserDownloadFileName("darwin:firefox"),
          "firefox",
          "firefox",
          force,
          opts
        );
      }
      if (["all", "chromium"].includes(kind)) {
        await installReplayBrowser(
          getBrowserDownloadFileName("darwin:chromium"),
          "Replay-Chromium.app",
          "Replay-Chromium.app",
          force,
          opts
        );
      }
      break;
    case "linux":
      if (["all", "firefox"].includes(kind)) {
        await installReplayBrowser(
          getBrowserDownloadFileName("linux:firefox"),
          "firefox",
          "firefox",
          force,
          opts
        );
      }
      if (["all", "chromium"].includes(kind)) {
        await installReplayBrowser(
          getBrowserDownloadFileName("linux:chromium"),
          "replay-chromium",
          "chrome-linux",
          force,
          opts
        );
      }
      break;
    case "win32":
      if (["all", "chromium"].includes(kind)) {
        await installReplayBrowser(
          getBrowserDownloadFileName("win32:chromium"),
          "replay-chromium",
          "replay-chromium",
          force,
          opts
        );
      }
      break;
  }
}

async function updateBrowsers(opts: Options & { browsers?: BrowserName[] }) {
  if (opts.browsers) {
    for (const browserName of opts.browsers) {
      await ensureBrowsersInstalled(browserName, true, opts);
    }
  } else {
    return ensureBrowsersInstalled("all", true, opts);
  }
}

function getPlatformKey(browserName: BrowserName): PlatformKeys | undefined {
  const key = `${process.platform}:${browserName}`;
  if (key in EXECUTABLE_PATHS) {
    return key as keyof typeof EXECUTABLE_PATHS;
  }

  return undefined;
}

function getExecutablePath(browserName: BrowserName, opts?: Options) {
  const overridePathKey = `REPLAY_${browserName.toUpperCase()}_EXECUTABLE_PATH`;
  const overridePath = process.env[overridePathKey];
  if (overridePath) {
    debug(`Using executable override for ${browserName}: ${overridePath}`);
    return overridePath;
  }

  const key = getPlatformKey(browserName);
  if (!key) {
    return null;
  }

  const executablePathParts = EXECUTABLE_PATHS[key];
  return executablePathParts ? path.join(getRuntimesDirectory(opts), ...executablePathParts) : null;
}

function extractBrowserArchive(browserDir: string, name: string) {
  const fullName = path.join(browserDir, name);
  const tarResult = spawnSync("tar", ["xf", name], { cwd: browserDir });
  if (tarResult.status !== 0) {
    console.error("Failed to extract", fullName);
    console.error(String(tarResult.stderr));

    throw new Error("Unable to extract browser archive");
  }

  fs.unlinkSync(fullName);
}

function getRuntimesDirectory(opts?: Options) {
  const replayDir = getDirectory(opts);
  return path.join(replayDir, "runtimes");
}

// Installs a browser if it isn't already installed.
async function installReplayBrowser(
  name: string,
  srcName: string,
  dstName: string,
  force = false,
  opts: Options = {}
) {
  const replayDir = getDirectory(opts);
  const browserDir = getRuntimesDirectory(opts);
  const dstDir = path.join(browserDir, dstName);
  const dstExists = fs.existsSync(dstDir);

  if (dstExists) {
    if (force) {
      debug("Removing %s from %s before updating", name, dstDir);
      // Remove the browser so installReplayBrowser will reinstall it. We don't have a way
      // to see that the current browser is up to date.
      fs.rmSync(dstDir, { force: true, recursive: true });
    } else {
      maybeLog(opts.verbose, `Skipping ${dstName}. Already exists in ${browserDir}`);
      return;
    }
  }

  debug("Installing %s from %s to %s", name, srcName, path.join(browserDir, name));

  const contents = await downloadReplayFile(name, opts);

  for (const dir of [replayDir, browserDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }

  maybeLog(opts.verbose, `Saving ${dstName} to ${browserDir}`);
  fs.writeFileSync(path.join(browserDir, name), contents);
  extractBrowserArchive(browserDir, name);

  if (srcName != dstName) {
    fs.renameSync(path.join(browserDir, srcName), path.join(browserDir, dstName));
  }
}

async function downloadReplayFile(downloadFile: string, opts: Options) {
  const options = {
    host: "static.replay.io",
    port: 443,
    path: `/downloads/${downloadFile}`,
  };

  for (let i = 0; i < 5; i++) {
    const waiter = defer<Buffer[] | null>();
    maybeLog(opts.verbose, `Downloading ${downloadFile} from replay.io (Attempt ${i + 1} / 5)`);
    debug("Downloading %o", options);
    const request = https.get(options, response => {
      if (response.statusCode != 200) {
        console.log(`Download received status code ${response.statusCode}, retrying...`);
        request.destroy();
        waiter.resolve(null);
        return;
      }
      const buffers: Buffer[] = [];
      response.on("data", data => buffers.push(data));
      response.on("end", () => waiter.resolve(buffers));
    });
    request.on("error", err => {
      console.log(`Download error ${err}, retrying...`);
      request.destroy();
      waiter.resolve(null);
    });
    const buffers = await waiter.promise;
    if (buffers) {
      return Buffer.concat(buffers);
    }

    maybeLog(opts.verbose, `Download of ${downloadFile} complete`);
  }

  throw new Error("Download failed, giving up");
}

export { getExecutablePath, ensureBrowsersInstalled, updateBrowsers };
