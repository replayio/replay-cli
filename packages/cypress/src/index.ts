/// <reference types="cypress" />

import path from "path";
import semver from "semver";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import { ReplayReporter } from "@replayio/test-utils";

import { TASK_NAME } from "./constants";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import CypressReporter from "./reporter";

let cypressReporter: CypressReporter;

const pluginVersion = require("../package.json").version;

const plugin: Cypress.PluginConfig = (on, config) => {
  initFixtureFile();

  const reporter = new ReplayReporter({
    name: "cypress",
    version: config.version,
    plugin: pluginVersion,
  });
  let selectedBrowser: "chromium" | "firefox";
  let startTime: number | undefined;
  cypressReporter = new CypressReporter();

  on("before:browser:launch", (browser, launchOptions) => {
    cypressReporter.setSelectedBrowser(browser.family);
    reporter.onTestSuiteBegin(undefined, "CYPRESS_REPLAY_METADATA");

    // Cypress around 10.9 launches the browser before `before:spec` is called
    // causing us to fail to create the metadata file and link the replay to the
    // current test
    reporter.onTestBegin(undefined, getMetadataFilePath());

    if (config.version && semver.gte(config.version, "10.9.0")) {
      return {
        ...launchOptions,
        env: {
          RECORD_REPLAY_DRIVER:
            process.env.RECORD_REPLAY_NO_RECORD && browser.family === "chromium"
              ? __filename
              : undefined,
          RECORD_ALL_CONTENT: process.env.RECORD_REPLAY_NO_RECORD ? undefined : 1,
          RECORD_REPLAY_METADATA_FILE: getMetadataFilePath(),
        },
      };
    }
  });
  on("before:spec", spec => {
    const startTime = Date.now();
    appendToFixtureFile("spec:start", { spec, startTime });

    cypressReporter.setStartTime(startTime);
    reporter.onTestBegin(undefined, getMetadataFilePath());
  });
  on("after:spec", (spec, result) => {
    appendToFixtureFile("spec:end", { spec, result });

    const tests = cypressReporter.getTestResults(spec, result);
    reporter.onTestEnd(tests, spec.relative);
  });

  on("task", {
    // Events are sent to the plugin by the support adapter which runs in the
    // browser context and has access to `Cypress` and `cy` methods.
    [TASK_NAME]: value => {
      if (!value || typeof value !== "object") return;

      appendToFixtureFile("task", value);
      cypressReporter.addStep(value);

      return true;
    },
  });

  // make sure we have a config object with the keys we need to mutate
  config = config || {};
  config.env = config.env || {};
  config.browsers = config.browsers || [];

  config.env.NO_COMMAND_LOG = process.env.CYPRESS_NO_COMMAND_LOG ?? config.env.NO_COMMAND_LOG ?? 1;

  const chromiumPath = getPlaywrightBrowserPath("chromium");
  if (chromiumPath) {
    config.browsers = config.browsers.concat({
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
    config.browsers = config.browsers.concat({
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

  return config;
};

export function getMetadataFilePath(workerIndex = 0) {
  return (
    process.env.RECORD_REPLAY_METADATA_FILE ||
    path.join(getDirectory(), `CYPRESS_METADATA_${workerIndex}`)
  );
}

export function getCypressReporter() {
  return cypressReporter;
}

export default plugin;
