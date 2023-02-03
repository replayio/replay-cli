/// <reference types="cypress" />

import semver from "semver";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import {
  getMetadataFilePath as getMetadataFilePathBase,
  initMetadataFile,
  ReplayReporter,
} from "@replayio/test-utils";
import dbg from "debug";

import { TASK_NAME } from "./constants";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import CypressReporter from "./reporter";

const debug = dbg("replay:cypress:plugin");

let cypressReporter: CypressReporter;

const pluginVersion = require("../package.json").version;

const plugin: Cypress.PluginConfig = (on, config) => {
  initFixtureFile();

  const reporter = new ReplayReporter({
    name: "cypress",
    version: config.version,
    plugin: pluginVersion,
  });
  cypressReporter = new CypressReporter(debug);

  const debugEvents = debug.extend("events");
  on("before:browser:launch", (browser, launchOptions) => {
    debugEvents("Handling before:browser:launch");

    cypressReporter.setSelectedBrowser(browser.family);
    reporter.onTestSuiteBegin(undefined, "CYPRESS_REPLAY_METADATA");

    // Cypress around 10.9 launches the browser before `before:spec` is called
    // causing us to fail to create the metadata file and link the replay to the
    // current test
    const metadataPath = getMetadataFilePath();
    reporter.onTestBegin(undefined, metadataPath);

    debugEvents("Browser launching: %o", { family: browser.family, metadataPath });

    if (config.version && semver.gte(config.version, "10.9.0")) {
      const env = {
        RECORD_REPLAY_DRIVER:
          process.env.RECORD_REPLAY_NO_RECORD && browser.family === "chromium"
            ? __filename
            : undefined,
        RECORD_ALL_CONTENT: process.env.RECORD_REPLAY_NO_RECORD ? undefined : 1,
        RECORD_REPLAY_METADATA_FILE: initMetadataFile(metadataPath),
      };

      debugEvents("Adding environment variables to browser: %o", env);

      return {
        ...launchOptions,
        env,
      };
    }
  });
  on("before:spec", spec => {
    debugEvents("Handling before:spec %s", spec.relative);

    const startTime = Date.now();
    appendToFixtureFile("spec:start", { spec, startTime });

    cypressReporter.clearSteps();
    cypressReporter.setStartTime(startTime);
    reporter.onTestBegin(undefined, getMetadataFilePath());
  });
  on("after:spec", (spec, result) => {
    debugEvents("Handling after:spec %s", spec.relative);

    appendToFixtureFile("spec:end", { spec, result });

    const tests = cypressReporter.getTestResults(spec, result);
    reporter.onTestEnd(tests, spec.relative);
  });

  const debugTask = debug.extend("task");
  on("task", {
    // Events are sent to the plugin by the support adapter which runs in the
    // browser context and has access to `Cypress` and `cy` methods.
    [TASK_NAME]: value => {
      debugTask("Handling %s task: %o", TASK_NAME, value);
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

  if (config.isTextTerminal) {
    config.env.NO_COMMAND_LOG =
      process.env.CYPRESS_NO_COMMAND_LOG ?? config.env.NO_COMMAND_LOG ?? 1;
    debug("Command log enabled? %s", config.env.NO_COMMAND_LOG);
  }

  const chromiumPath = getPlaywrightBrowserPath("chromium");
  if (chromiumPath) {
    debug("Adding chromium to cypress at %s", chromiumPath);
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
  } else {
    debug("Chromium not supported on this platform", chromiumPath);
  }

  const firefoxPath = getPlaywrightBrowserPath("firefox");
  if (firefoxPath) {
    debug("Adding firefox to cypress at %s", chromiumPath);
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
  } else {
    debug("Firefox not supported on this platform", chromiumPath);
  }

  return config;
};

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("CYPRESS", workerIndex);
}

export function getCypressReporter() {
  return cypressReporter;
}

export default plugin;
