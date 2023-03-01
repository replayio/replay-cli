#!/usr/bin/env node

import install from "../src/install";
import { configure, ReplayMode } from "../src/mode";
import cypressRepeat, { SpecRepeatMode } from "../src/cypress-repeat";
import { gte } from "semver";

let [, , cmd, ...args] = process.argv;

let firstRun = false;
if (cmd === "first-run" && !process.env.REPLAY_SKIP_BROWSER_DOWNLOAD) {
  args = [];
  cmd = "install";
  firstRun = true;
}

function commandInstall() {
  console.log("Installing Replay browsers for cypress");

  let browser = args[0] || "all";
  install(browser).then(() => {
    console.log("Done");
  });
}

function parseRetryCount(arg: string | undefined) {
  const num = arg ? Number.parseInt(arg) : NaN;
  if (isNaN(num)) {
    throw new Error("Error: --count must be a number");
  }

  return num;
}

async function commandRun() {
  let modeOpt: string | undefined;
  let levelOpt: string | undefined;
  let retryCount: number | undefined;

  // TODO [ryanjduffy]: Migrate to commander
  while (args.length) {
    switch (args[0]) {
      case "-m":
      case "--mode":
        args.shift();
        modeOpt = args.shift();

        continue;
      case "-l":
      case "--level":
        args.shift();
        levelOpt = args.shift();

        continue;

      case "-c":
      case "--count":
        args.shift();
        retryCount = parseRetryCount(args.shift());

        continue;
    }

    break;
  }

  const { repeat, mode } = configure({ mode: modeOpt, level: levelOpt, stressCount: retryCount });

  if (
    (mode === ReplayMode.Diagnostics || mode === ReplayMode.RecordOnRetry) &&
    !gte(require("cypress/package.json").version, "10.9.0")
  ) {
    console.error("Cypress 10.9 or greater is required for diagnostic or record-on-retry modes");
    process.exit(1);
  }

  const failed = await cypressRepeat({
    repeat,
    mode: mode === ReplayMode.RecordOnRetry ? SpecRepeatMode.Failed : SpecRepeatMode.All,
    untilPasses: mode === ReplayMode.RecordOnRetry,
    args,
  });

  process.exit(failed ? 1 : 0);
}

function help() {
  console.log(`
npx @replayio/cypress

Provides utilities to support using Replay (https://replay.io) with Cypress

Available commands:

  - install [all | firefox | chromium]
    Installs all or the specified Replay browser

  - run
    Runs your cypress tests with additional repeat modes
  `);
}

(async () => {
  try {
    switch (cmd) {
      case "install":
        commandInstall();
        break;
      case "run":
        await commandRun();
        break;
      case "help":
      default:
        help();
        break;
    }
  } catch (e) {
    if (firstRun) {
      // Log install errors during first-run but don't fail package install
      console.error(e);
    } else {
      throw e;
    }
  }
})();
