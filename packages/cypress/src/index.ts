/// <reference types="cypress" />

import { logger } from "@replay-cli/shared/logger";
import { mixpanelClient } from "@replay-cli/shared/mixpanelClient";
import { getRuntimePath } from "@replay-cli/shared/runtime/getRuntimePath";
import { initializeSession } from "@replay-cli/shared/session/initializeSession";
import { RecordingEntry, initMetadataFile, warn } from "@replayio/test-utils";
import chalk from "chalk";
import path from "path";
import semver from "semver";
import { name as packageName, version as packageVersion } from "../package.json";
import { CONNECT_TASK_NAME } from "./constants";
import { PluginFeature } from "./features";
import { updateJUnitReports } from "./junit";
import CypressReporter, { PluginOptions, getMetadataFilePath, isStepEvent } from "./reporter";
import { createServer } from "./server";
import type { StepEvent } from "./support";
export type { PluginOptions } from "./reporter";
export {
  getMetadataFilePath,
  onAfterRun,
  onAfterSpec,
  onBeforeBrowserLaunch,
  onBeforeRun,
  onBeforeSpec,
  plugin,
  cypressOnWrapper as wrapOn,
};

let cypressReporter: CypressReporter | undefined;
let missingSteps = false;

function assertReporter(
  reporter: CypressReporter | undefined
): asserts reporter is CypressReporter {
  if (!reporter) {
    throw new Error("Plugin method called without initializing @replayio/cypress plugin");
  }
}

function loudWarning(...lines: string[]) {
  const terminalWidth = process.stdout.columns || 80;
  const packageName = "@replayio/cypress";

  const startHeaderWidth = Math.floor((terminalWidth - packageName.length) / 2 - 1);
  const endHeaderWidth = terminalWidth - startHeaderWidth - packageName.length - 2;

  console.warn(
    "\n%s %s %s\n",
    "".padEnd(startHeaderWidth, "="),
    chalk.magentaBright(packageName),
    "".padEnd(endHeaderWidth, "=")
  );
  lines.forEach(l => console.warn(l));
  console.warn("\n%s\n", "".padEnd(terminalWidth, "="));
}

function getAuthKey<T extends { env?: { [key: string]: any } }>(config: T): string | undefined {
  return (
    // migrating away from `RECORD_REPLAY_` to `REPLAY_`
    config.env?.REPLAY_API_KEY ||
    config.env?.RECORD_REPLAY_API_KEY ||
    process.env.REPLAY_API_KEY ||
    process.env.RECORD_REPLAY_API_KEY
  );
}

function updateReporters(
  relativePath: string,
  recordings: RecordingEntry[],
  config: Cypress.PluginConfigOptions
) {
  const { reporter, reporterOptions } = config;
  logger.info("UpdateReporters:Started", { reporter, reporterOptions });
  if (reporter !== "junit") {
    return;
  }

  const projectBase = path.dirname(config.configFile);
  if (recordings.length === 0) {
    return;
  }

  updateJUnitReports(relativePath, recordings, projectBase, reporterOptions?.mochaFile);
}

async function onBeforeRun(details: Cypress.BeforeRunDetails) {
  assertReporter(cypressReporter);
  const authKey = getAuthKey(details.config);
  if (authKey) {
    await cypressReporter.authenticate(authKey);
  }
}

function onBeforeBrowserLaunch(
  browser: Cypress.Browser,
  launchOptions: Cypress.BeforeBrowserLaunchOptions
) {
  logger.info("OnBeforeBrowserLaunch:Started", { browser, launchOptions });
  assertReporter(cypressReporter);
  cypressReporter.onLaunchBrowser(browser.family);

  logger.info("OnBeforeBrowserLaunch:BrowserLaunching", { family: browser.family });

  const config = cypressReporter.config;
  if (browser.name !== "electron" && config.version && semver.gte(config.version, "10.9.0")) {
    const noRecord = !!process.env.RECORD_REPLAY_NO_RECORD;

    const replayEnv = {
      RECORD_REPLAY_DRIVER: noRecord && browser.family === "chromium" ? __filename : undefined,
      RECORD_ALL_CONTENT: noRecord ? undefined : "1",
      RECORD_REPLAY_METADATA_FILE: initMetadataFile(getMetadataFilePath()),
      RECORD_REPLAY_ENABLE_ASSERTS: process.env.RECORD_REPLAY_ENABLE_ASSERTS,
      // it doesn't log anything eagerly but it makes it possible to enable verbose logs with DEBUG=cypress:launcher:browsers
      RECORD_REPLAY_VERBOSE: "1",
    };

    const env: NodeJS.ProcessEnv = {
      ...launchOptions.env,
      ...replayEnv,
      ...cypressReporter.getExtraEnv(),
    };

    logger.info("OnBeforeBrowserLaunch:BrowserEnvironment", { replayEnv });

    launchOptions.env = env;
  }

  return launchOptions;
}

async function onAfterRun() {
  assertReporter(cypressReporter);

  const utilsPendingWork = await cypressReporter.onEnd();
  utilsPendingWork.forEach(entry => {
    if (entry.type === "post-test" && !("error" in entry)) {
      const {
        testRun: {
          tests,
          source: { path },
        },
        recordings,
      } = entry;
      const completedTests = tests.filter(t => ["passed", "failed", "timedOut"].includes(t.result));

      if (cypressReporter) {
        updateReporters(path, recordings, cypressReporter.config);
      }

      if (
        completedTests.length > 0 &&
        tests.flatMap(t => Object.values(t.events).flat()).length === 0
      ) {
        missingSteps = true;
      }
    }
  });

  if (missingSteps) {
    logger.error("OnAfterRun:AfterRunMissingSteps", { missingSteps });
    mixpanelClient.trackEvent("warning.missing-steps");
    loudWarning(
      "Your tests completed but our plugin did not receive any command events.",
      "",
      `Did you remember to include ${chalk.magentaBright(
        "@replayio/cypress/support"
      )} in your support file?`
    );
  }

  await logger.close().catch(() => {});
}

function onBeforeSpec(spec: Cypress.Spec) {
  logger.info("OnBeforeSpec:Started", { spec: spec.relative });
  assertReporter(cypressReporter);
  cypressReporter.onBeforeSpec(spec);
}

function onAfterSpec(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
  logger.info("OnAfterSpec:Started", { spec: spec.relative });
  assertReporter(cypressReporter);
  return cypressReporter.onAfterSpec(spec, result);
}

function onReplayTask(value: any) {
  logger.info("OnReplayTask:Started", { value });
  assertReporter(cypressReporter);
  const reporter = cypressReporter;

  if (!Array.isArray(value)) return;

  value.forEach(v => {
    if (isStepEvent(v)) {
      logger.info("OnReplayTask:ReplayTaskEvent", { event: v });
      reporter.addStep(v);
    } else {
      logger.error("OnReplayTask:ReplayTaskUnexpectedPayload", { payload: v });
      mixpanelClient.trackEvent("error.replay-task-unexpected-payload", { payload: v });
    }
  });

  return true;
}

const cypressOnWrapper = (base: Cypress.PluginEvents): Cypress.PluginEvents => {
  const handlers: any = {};

  const singleHandlerEvents = {
    "after:screenshot": false,
    "file:preprocessor": false,
    "dev-server:start": false,
  };

  const makeHandlerDispatcher =
    (e: string) =>
    async (...args: any[]) => {
      if (e === "before:browser:launch") {
        let [browser, launchOptions] = args;
        for (const currentHandler of handlers[e]) {
          launchOptions = (await currentHandler(browser, launchOptions)) ?? launchOptions;
        }

        return launchOptions;
      } else {
        for (const currentHandler of handlers[e]) {
          await currentHandler(...args);
        }
      }
    };

  return (e, h: any) => {
    if (e === "task") {
      base(e, h);
      return;
    }

    if (Object.keys(singleHandlerEvents).includes(e)) {
      const key = e as keyof typeof singleHandlerEvents;
      if (singleHandlerEvents[key] === true) {
        throw new Error(`Only 1 handler allowed for ${e}`);
      }

      singleHandlerEvents[key] = true;
      base(e as any, h);
      return;
    }

    handlers[e] = handlers[e] || [];
    handlers[e].push(h);

    if (handlers[e].length === 1) {
      base(e as any, makeHandlerDispatcher(e));
    }
  };
};

const plugin = (
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options: PluginOptions = {}
) => {
  initializeSession({
    accessToken: getAuthKey(config),
    packageName,
    packageVersion,
  });

  cypressReporter = new CypressReporter(config, options);

  const portPromise = createServer().then(({ server: wss, port }) => {
    wss.on("connection", function connection(ws) {
      logger.info("CypressPlugin:WebSocketConnected");

      ws.on("close", () => {
        logger.info("CypressPlugin:WebSocketClosed");
      });

      ws.on("error", error => {
        logger.error("CypressPlugin:WebSocketError", { error });
        mixpanelClient.trackEvent("error.websocket-error", { error });
        warn("WebSocket error", error);
      });

      ws.on("message", function message(data) {
        try {
          const payload = data.toString("utf-8");
          const obj = JSON.parse(payload) as { events: StepEvent[] };
          onReplayTask(obj.events);
        } catch (error) {
          logger.error("CypressPlugin:WebSocketMessageError", { error });
          mixpanelClient.trackEvent("error.websocket-message-error", { error });
          warn("Error parsing message from test", error);
        }
      });
    });

    return port;
  });

  if (!cypressReporter.isFeatureEnabled(PluginFeature.Metrics)) {
    process.env.RECORD_REPLAY_TEST_METRICS = "0";
  }

  if (
    cypressReporter.isFeatureEnabled(PluginFeature.Plugin) ||
    cypressReporter.isFeatureEnabled(PluginFeature.Metrics)
  ) {
    on("after:spec", onAfterSpec);
  }

  if (
    cypressReporter.isFeatureEnabled(PluginFeature.Plugin) ||
    cypressReporter.isFeatureEnabled(PluginFeature.Support)
  ) {
    on("task", {
      [CONNECT_TASK_NAME]: async value => {
        const port = await portPromise;

        logger.info("CypressPlugin:ConnectedToServer", { port });
        return { port };
      },
    });
  }

  if (cypressReporter.isFeatureEnabled(PluginFeature.Plugin)) {
    on("before:run", onBeforeRun);
    on("before:browser:launch", onBeforeBrowserLaunch);
    on("before:spec", onBeforeSpec);
    on("after:run", onAfterRun);

    // make sure we have a config object with the keys we need to mutate
    config = config || {};
    config.env = config.env || {};
    config.browsers = config.browsers || [];

    if (config.isTextTerminal) {
      config.env.NO_COMMAND_LOG =
        process.env.CYPRESS_NO_COMMAND_LOG ?? config.env.NO_COMMAND_LOG ?? 1;
      logger.info("CypressPlugin:CommandLogEnabled", {
        noCommandLog: config.env.NO_COMMAND_LOG,
      });
    }

    const chromiumPath = getRuntimePath();
    if (chromiumPath) {
      logger.info("CypressPlugin:AddedChromium", { chromiumPath });
      config.browsers = config.browsers.concat({
        name: "replay-chromium",
        channel: "stable",
        family: "chromium",
        displayName: "Replay",
        version: "108.0",
        path: chromiumPath,
        majorVersion: 108,
        isHeaded: true,
        isHeadless: false,
      });
    } else {
      logger.info("CypressPlugin:ReplayChromiumNotSupported", {
        platform: process.platform,
        chromiumPath,
      });
    }
  }

  return config;
};

export function getCypressReporter() {
  return cypressReporter;
}

export default plugin;
