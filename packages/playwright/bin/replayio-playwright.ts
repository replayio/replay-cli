#!/usr/bin/env node

import install from "../src/install";

let [, , cmd, ...args] = process.argv;

let firstRun = false;
if (
  cmd === "first-run" &&
  !process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD &&
  !process.env.REPLAY_SKIP_BROWSER_DOWNLOAD
) {
  args = [];
  cmd = "install";
  firstRun = true;
}

function commandInstall() {
  console.log("Installing Replay browsers for playwright");

  let browser = args[0] || "all";
  install(browser).then(() => {
    console.log("Done");
  });
}

function help() {
  console.log(`
npx @replayio/playwright

Provides utilities to support using Replay (https://replay.io) with Playwright

Available commands:

  - install [all | chromium]
    Installs all or the specified Replay browser
  `);
}

try {
  switch (cmd) {
    case "install":
      commandInstall();
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
