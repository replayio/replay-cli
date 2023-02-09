#!/usr/bin/env node

import { spawnSync } from "child_process";
import install from "../src/install";
import { getDiagnosticRetryCount, getReplayMode, ReplayMode } from "../src/mode";

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

function commandRun() {
  const runIndex = process.argv.indexOf("run");

  if (runIndex === -1) {
    throw new Error("huh?");
  }

  let noNpx = false;

  while (args.length) {
    switch (args[0]) {
      case "--mode":
        args.shift();
        process.env.REPLAY_CYPRESS_MODE = args.shift();

        continue;
      case "--no-npx":
        noNpx = true;
        args.shift();

        continue;
    }

    break;
  }

  const retryCount = getDiagnosticRetryCount();
  const mode = getReplayMode();

  const command = noNpx ? "cypress-repeat" : "npx";
  const spawnArgs = [
    ...(noNpx ? [] : ["cypress-repeat"]),
    "run",
    "-n",
    String(retryCount),
    ...(mode === ReplayMode.RecordOnRetry ? ["--rerun-failed-only"] : []),
    ...args,
  ];

  console.log(command, ...spawnArgs);

  spawnSync(command, spawnArgs, { stdio: "inherit" });
}

function help() {
  console.log(`
npx @replayio/cypress

Provides utilities to support using Replay (https://replay.io) with Cypress

Available commands:

  - install [all | firefox | chromium]
    Installs all or the specified Replay browser

  - run
    Runs your cypress tests using cypress-repeat
  `);
}

try {
  switch (cmd) {
    case "install":
      commandInstall();
      break;
    case "run":
      commandRun();
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
