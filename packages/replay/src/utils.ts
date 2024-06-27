// This module is meant to be somewhat browser-friendly.
// It can't lead to importing node builtin modules like like worker_threads.
// Cypress bundles this file and runs it in the browser,
// some imports like path and http are OK because they are aliased~ by their webpack config:
// https://github.com/cypress-io/cypress/blob/fb87950d6337ba99d13cb5fa3ce129e5f5cac02b/npm/webpack-batteries-included-preprocessor/index.js#L151
// TODO: decouple this more so we never run into problems with this - we shouldn't rely on implementation details of Cypress bundling
import dbg from "debug";
import path from "path";
import { Agent as HttpAgent, AgentOptions } from "http";
import { Agent as HttpsAgent } from "https";

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
  const pkg = require("@replayio/replay/package.json");
  return pkg.version;
}

function getNameAndVersion() {
  const pkg = require("@replayio/replay/package.json");
  return `${pkg.name}/${pkg.version}`;
}

function getUserAgent() {
  return getNameAndVersion();
}

function getHttpAgent(server: string, agentOptions?: AgentOptions) {
  const serverURL = new URL(server);
  if (!agentOptions) {
    return;
  }

  if (["wss:", "https:"].includes(serverURL.protocol)) {
    return new HttpsAgent(agentOptions);
  } else if (["ws:", "http:"].includes(serverURL.protocol)) {
    return new HttpAgent(agentOptions);
  }

  throw new Error(`Unsupported protocol: ${serverURL.protocol} for URL ${serverURL}`);
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
  getHttpAgent,
};
