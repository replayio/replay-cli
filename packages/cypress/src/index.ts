/// <reference types="cypress" />

import semver from "semver";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { initMetadataFile } from "@replayio/test-utils";
import dbg from "debug";

import { TASK_NAME } from "./constants";
import CypressReporter, { getMetadataFilePath } from "./reporter";

const debug = dbg("replay:cypress:plugin");

let cypressReporter: CypressReporter;

const plugin: Cypress.PluginConfig = (on, config) => {
  cypressReporter = new CypressReporter(config, debug);
  const debugEvents = debug.extend("events");

  on("before:browser:launch", (browser, launchOptions) => {
    debugEvents("Handling before:browser:launch");
    cypressReporter.onLaunchBrowser(browser.family);

    debugEvents("Browser launching: %o", { family: browser.family });

    if (browser.name !== "electron" && config.version && semver.gte(config.version, "10.9.0")) {
      const diagnosticConfig = cypressReporter.getDiagnosticConfig();
      const noRecord = !!process.env.RECORD_REPLAY_NO_RECORD || diagnosticConfig.noRecord;

      const env: NodeJS.ProcessEnv = {
        RECORD_REPLAY_DRIVER: noRecord && browser.family === "chromium" ? __filename : undefined,
        RECORD_ALL_CONTENT: noRecord ? undefined : "1",
        RECORD_REPLAY_METADATA_FILE: initMetadataFile(getMetadataFilePath()),
        ...diagnosticConfig.env,
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
    cypressReporter.onBeforeSpec(spec);
  });
  on("after:spec", (spec, result) => {
    debugEvents("Handling after:spec %s", spec.relative);
    cypressReporter.onAfterSpec(spec, result);
  });

  const debugTask = debug.extend("task");
  on("task", {
    // Events are sent to the plugin by the support adapter which runs in the
    // browser context and has access to `Cypress` and `cy` methods.
    [TASK_NAME]: value => {
      debugTask("Handling %s task: %o", TASK_NAME, value);
      if (!value || typeof value !== "object") return;

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
      name: "replay-chromium",
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
      name: "replay-firefox",
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

export function getCypressReporter() {
  return cypressReporter;
}

export default plugin;
export { getMetadataFilePath };
