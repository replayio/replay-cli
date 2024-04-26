import install from "./install";

let [, , cmd] = process.argv;

function commandInstall() {
  console.log("Installing Replay browsers for puppeteer");

  install().then(() => {
    console.log("Done");
  });
}

function help() {
  console.log(`
npx @replayio/puppeteer

Provides utilities to support using Replay (https://replay.io) with Puppeteer

Available commands:

  - install
    Installs the Replay Chromium browser
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
