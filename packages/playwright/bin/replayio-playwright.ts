#!/usr/bin/env node

import install from "../src/install";

const [, , cmd, ...args] = process.argv;

if (
  cmd === "install" ||
  (cmd === "first-run" && !process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)
) {
  console.log("Installing Replay browsers for playwright");

  let browser = args[0] || "all";
  install(browser).then(() => {
    console.log("Done");
  });
}
