/// <reference types="cypress" />

import path from "path";
import {
  listAllRecordings,
  uploadRecording,
  getPlaywrightBrowserPath,
} from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";

const plugin: Cypress.PluginConfig = (on, config) => {
  const upload = config.env.replay?.upload || "failed";

  on("after:spec", async (spec, results) => {
    if (
      upload === "all" ||
      (upload === "failed" && results.stats.failures > 0)
    ) {
      const recordings = listAllRecordings();
      if (recordings.length > 0) {
        const recording = recordings[recordings.length - 1];
        if (recording && typeof recording.id === "number") {
          console.log("Uploading recording of", spec.relative);
          await uploadRecording(recording.id, { verbose: true });
        }
      }
    }
  });

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
    reporter: '@replayio/cypress/reporter',
  } as Cypress.ConfigOptions);

  return config;
};

export function getMetadataFilePath(workerIndex = 0) {
  return path.join(getDirectory(), `CYPRESS_METADATA_${workerIndex}`);
}

export default plugin;
