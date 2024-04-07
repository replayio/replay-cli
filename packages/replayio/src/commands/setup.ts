import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import {
  findPlaywrightConfig,
  installReplayDependencies,
  setupReplayInPlaywrightConfig,
} from "../utils/config/playwright";
import { Command } from "commander";

const setupCommand = registerCommand("setup").description("Setup Replay for test runner");
const playwrightCommand = new Command("playwright")
  .option("--config <path>", "Path to playwright config file")
  .description("Setup Replay for Playwright test runner")
  .action(setupPlaywright);
setupCommand.addCommand(playwrightCommand);

async function setupPlaywright({ config }: { config?: string }) {
  const hasPackageJson = existsSync(path.join(process.cwd(), "package.json"));

  if (!hasPackageJson) {
    console.error(chalk.red("Please ensure you're in the Node.js project directory."));
    await exitProcess(1);
  }

  let configPath = config ?? findPlaywrightConfig();
  if (!configPath) {
    console.error(
      chalk.red("Playwright config file not found. Use --config flag to specify the path.")
    );
    await exitProcess(1);
    return;
  }

  try {
    installReplayDependencies(process.cwd());
    console.log(
      chalk.greenBright("✔"),
      chalk.whiteBright("Replay dependencies installed successfully.")
    );
  } catch (e) {
    console.error(chalk.redBright("✘"), chalk.red("Failed to install Replay dependencies."));
    Object.values(docs).forEach(doc => console.log(chalk.whiteBright("•", doc)));
    await exitProcess(1);
  }

  try {
    setupReplayInPlaywrightConfig(configPath);
    console.log(
      chalk.greenBright("✔"),
      chalk.whiteBright(
        "Playwright config updated successfully. Run your formatter to clear up any lint errors."
      )
    );
  } catch (e) {
    console.error(chalk.redBright("✘"), chalk.red("Could not update Playwright config file."));
    console.log(chalk.whiteBright("•", docs.config));
    console.log(chalk.whiteBright("•", docs.postinstall));
    await exitProcess(1);
  }

  console.log(chalk.greenBright("✔"), chalk.whiteBright("Replay setup complete."));
  console.log(chalk.whiteBright(docs.postinstall));

  await exitProcess(0);
}

const docs = {
  install: "Add @replayio/playwright as a dev dependency.",
  config: `Update your playwright.config.ts to include Replay's Chromium browser and reporter. Here's how:
  import { PlaywrightTestConfig, devices } from "@playwright/test";
  import { devices as replayDevices } from "@replayio/playwright";
   
  const config: PlaywrightTestConfig = {
    reporter: [
      [
        "@replayio/playwright/reporter",
        {
          apiKey: process.env.REPLAY_API_KEY,
          upload: true,
        },
      ],
      ["line"],
    ],
    projects: [
      {
        name: "replay-chromium",
        use: { ...(replayDevices["Replay Chromium"] as any) },
      },
    ],
  };
  export default config;
`,
  postinstall: `Next steps:
  1. Generate API key for your team at https://app.replay.io/.
  2. Set it as REPLAY_API_KEY in your environment.
  3. Execute Playwright tests with Replay using: playwright test --project replay-chromium`,
};
