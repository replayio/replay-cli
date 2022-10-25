/// <reference types="cypress" />

import path from "path";
import { getPlaywrightBrowserPath } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import { ReplayReporter, Test } from "@replayio/test-utils";
import { TASK_NAME } from "./constants";
import type { StepEvent } from "./support";

function groupStepsByTest(steps: StepEvent[]) {
  // The steps can come in out of order but are sortable by timestamp
  const sortedSteps = [...steps].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const stepsByTest = sortedSteps.reduce<Record<string, StepEvent[]>>((acc, v) => {
    const key = JSON.stringify(v.test);
    const testSteps = (acc[key] = acc[key] || []);
    testSteps.push(v);

    return acc;
  }, {});

  return stepsByTest;
}

const plugin: Cypress.PluginConfig = (on, config) => {
  let steps: StepEvent[] = [];

  const reporter = new ReplayReporter({ name: "cypress", version: config.version });
  let selectedBrowser: "chromium" | "firefox";
  on("before:browser:launch", (browser, launchOptions) => {
    selectedBrowser = browser.family;
    reporter.onTestSuiteBegin(undefined, "CYPRESS_REPLAY_METADATA");

    const [major, minor] = config.version?.split(".") || [];
    if (major && Number.parseInt(major) >= 10 && minor && Number.parseInt(minor) >= 9) {
      return {
        ...launchOptions,
        env: {
          RECORD_REPLAY_DRIVER:
            process.env.RECORD_REPLAY_NO_RECORD && selectedBrowser === "chromium"
              ? __filename
              : undefined,
          RECORD_ALL_CONTENT: process.env.RECORD_REPLAY_NO_RECORD ? undefined : 1,
          RECORD_REPLAY_METADATA_FILE: getMetadataFilePath(),
        },
      };
    }
  });
  on("before:spec", () => reporter.onTestBegin(undefined, getMetadataFilePath()));
  on("after:spec", (spec, result) => {
    const stepsByTest = groupStepsByTest(steps);

    const tests = result.tests.map<Test>(t => {
      return {
        title: t.title[t.title.length - 1] || spec.relative,
        path: ["", selectedBrowser || "", spec.relative, spec.specType || ""],
        result: t.state == "failed" ? "failed" : "passed",
        relativePath: spec.relative,
        error: t.displayError
          ? {
              // we don't get line/column from cypress yet but we may be able to
              // derive it later once we're tracking the steps
              message: t.displayError.substring(0, t.displayError.indexOf("\n")),
            }
          : undefined,
        steps: stepsByTest[JSON.stringify(t.title)],
      };
    });

    reporter.onTestEnd(tests, spec.relative);
  });

  on("task", {
    [TASK_NAME]: value => {
      if (!value || typeof value !== "object") return;

      steps.push(value);

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

export default plugin;
