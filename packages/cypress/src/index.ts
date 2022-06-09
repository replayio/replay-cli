/// <reference types="cypress" />

import path from "path";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import ReplayReporter from "./reporter";

const plugin: Cypress.PluginConfig = (on, config) => {

  const reporter = new ReplayReporter(getMetadataFilePath());
  on("before:browser:launch", (browser) => reporter.onBegin(browser.family));
  on("before:spec", spec => reporter.onTestBegin(spec));
  on("after:spec", (spec, result) => reporter.onTestEnd(spec, result));

  const chromiumPath = getPlaywrightBrowserPath("chromium");
  if (chromiumPath) {
    Object.assign(config, {
      browsers: config.browsers.concat({
        name: "Replay",
        channel: "stable",
        family: "chromium",
        displayName: "Replay",
        version: "91.0",
        path: chromiumPath,
        majorVersion: 91,
        isHeaded: true,
        isHeadless: false,
      }),
    });
  }

  const firefoxPath = getPlaywrightBrowserPath("firefox");
  if (firefoxPath) {
    Object.assign(config, {
      browsers: config.browsers.concat({
        name: "Replay",
        channel: "stable",
        family: "firefox",
        displayName: "Replay",
        version: "91.0",
        path: firefoxPath,
        majorVersion: 91,
        isHeaded: true,
        isHeadless: false,
      }),
    });
  }

  Object.assign(config, {
    reporter: "@replayio/cypress/reporter",
  } as Cypress.ConfigOptions);

  return config;
};

export function getMetadataFilePath(workerIndex = 0) {
  return path.join(getDirectory(), `CYPRESS_METADATA_${workerIndex}`);
}

export default plugin;
