import dbg from "debug";
import path from "path";

import { BrowserName, Options } from "./types";

const debug = dbg("replay:cli");

// Get the executable name to use when opening a URL.
// It would be nice to use an existing npm package for this,
// but the obvious choice of "open" didn't actually work on linux
// when testing...
export function openExecutable() {
  switch (process.platform) {
    case "darwin":
      return "open";
    case "linux":
      return "xdg-open";
    default:
      throw new Error("Unsupported platform");
  }
}

function defer<T = unknown>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: any) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function maybeLog(verbose: boolean | undefined, str: string) {
  debug(str);
  if (verbose) {
    console.log(str);
  }
}

function getDirectory(opts?: Pick<Options, "directory">) {
  const home = process.env.HOME || process.env.USERPROFILE;
  return (
    (opts && opts.directory) || process.env.RECORD_REPLAY_DIRECTORY || path.join(home!, ".replay")
  );
}

function isValidUUID(str: unknown) {
  if (typeof str != "string" || str.length != 36) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    if ("0123456789abcdef-".indexOf(str[i]) == -1) {
      return false;
    }
  }
  return true;
}

async function waitForTime(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Random extra delay under 100ms to avoid retrying in bursts.
function jitter(): number {
  return Math.random() * 100.0;
}

// Returns backoff timeouts (in ms) in a geometric progression, and with jitter.
function backoff(iteration: number): number {
  return 2 ** iteration * 100 + jitter();
}

const MAX_ATTEMPTS = 5;

export async function exponentialBackoffRetry<T>(
  fn: () => T,
  onFail?: (e: unknown) => void
): Promise<T> {
  let currentAttempt = 0;
  while (currentAttempt <= MAX_ATTEMPTS) {
    currentAttempt++;
    try {
      return await fn();
    } catch (e) {
      if (onFail) {
        onFail(e);
      }
      if (currentAttempt == MAX_ATTEMPTS) {
        throw e;
      }
      waitForTime(backoff(currentAttempt));
    }
  }
  throw Error("ShouldBeUnreachable");
}

function fuzzyBrowserName(browser?: string): BrowserName {
  browser = browser?.toLowerCase()?.trim();

  switch (browser) {
    case "chrome":
      return "chromium";
    case "gecko":
      return "firefox";
  }

  return browser as BrowserName;
}

function assertValidBrowserName(browser?: string): asserts browser is BrowserName {
  if (!browser || (browser !== "chromium" && browser !== "firefox")) {
    throw new Error("Unsupported browser: " + browser);
  }
}

function getCurrentVersion() {
  const pkg = require(path.join(__dirname, "../package.json"));
  return pkg.version;
}

function getNameAndVersion() {
  const pkg = require(path.join(__dirname, "../package.json"));
  return `${pkg.name}/${pkg.version}`;
}

function getUserAgent() {
  return getNameAndVersion();
}

export {
  assertValidBrowserName,
  fuzzyBrowserName,
  defer,
  maybeLog,
  getDirectory,
  isValidUUID,
  getCurrentVersion,
  getUserAgent,
};
