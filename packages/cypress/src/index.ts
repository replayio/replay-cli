/// <reference types="cypress" />

import path from "path";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import { ReplayReporter } from "@replayio/test-utils";

import { TASK_NAME } from "./constants";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import CypressReporter from "./reporter";

let cypressReporter: CypressReporter;

const plugin: Cypress.PluginConfig = (on, config) => {
  initFixtureFile();

  const reporter = new ReplayReporter({ name: "cypress", version: config.version });
  cypressReporter = new CypressReporter();

  on("before:browser:launch", (browser, launchOptions) => {
    cypressReporter.setSelectedBrowser(browser.family);
    reporter.onTestSuiteBegin(undefined, "CYPRESS_REPLAY_METADATA");

    const [major, minor] = config.version?.split(".") || [];
    if (major && Number.parseInt(major) >= 10 && minor && Number.parseInt(minor) >= 9) {
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

  const chromiumPath = getPlaywrightBrowserPath("chromium");
  if (chromiumPath) {
    Object.assign(config, {
      browsers: config.browsers.concat({
        name: "Replay Chromium",
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
        name: "Replay Firefox",
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
