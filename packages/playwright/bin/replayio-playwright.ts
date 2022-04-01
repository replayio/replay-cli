#!/usr/bin/env node

import install from "../src/install";

let [, , cmd, ...args] = process.argv;

if (cmd === "first-run" && !process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
  args = [];
  cmd = "install";
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

  - install [all | firefox | chromium]
    Installs all or the specified Replay browser
  `);
}

switch (cmd) {
  case "install":
    commandInstall();
    break;
  case "help":
  default:
    help();
    break;
}
