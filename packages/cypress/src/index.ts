/// <reference types="cypress" />

import path from "path";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import ReplayReporter from "./reporter";

const plugin: Cypress.PluginConfig = (on, config) => {
  const reporter = new ReplayReporter(getMetadataFilePath());
  on("before:browser:launch", browser => reporter.onBegin(browser.family));
  on("before:spec", spec => reporter.onTestBegin(spec));
  on("after:spec", (spec, result) => reporter.onTestEnd(spec, result));

  const chromiumPath = getPlaywrightBrowserPath("chromium");
  let browsers = config.browsers || [];
  if (chromiumPath) {
    browsers = browsers.concat({
      name: "Replay Chromium",
      channel: "stable",
      family: "chromium",
      displayName: "Replay",
      version: "91.0",
      path: chromiumPath,
      majorVersion: 91,
      isHeaded: true,
      isHeadless: false,
    });
  }

  const firefoxPath = getPlaywrightBrowserPath("firefox");
  if (firefoxPath) {
    browsers = browsers.concat({
      name: "Replay Firefox",
      channel: "stable",
      family: "firefox",
      displayName: "Replay",
      version: "91.0",
      path: firefoxPath,
      majorVersion: 91,
      isHeaded: true,
      isHeadless: false,
    });
  }

  Object.assign(config, {
    browsers,
  });

  return config;
};

export function getMetadataFilePath(workerIndex = 0) {
  return (
    process.env.RECORD_REPLAY_METADATA_FILE ||
    path.join(getDirectory(), `CYPRESS_METADATA_${workerIndex}`)
  );
}

type ConfigOrPromise = Cypress.PluginConfigOptions | Promise<Cypress.PluginConfigOptions>;

function isPromise(config: ConfigOrPromise): config is Promise<Cypress.PluginConfigOptions> {
  return typeof config === "object" && "then" in config && typeof config.then === "function";
}

const replay = (on: Cypress.PluginEvents, config: ConfigOrPromise) => {
  if (isPromise(config)) {
    return config.then(config => plugin(on, config));
  }

  return plugin(on, config);
};

export default replay;
