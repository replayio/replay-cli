import chalk from "chalk";
import { execSync } from "child_process";
import { version as currentVersion, name } from "../../package.json";
import { prompt } from "./prompt/prompt";
import { shouldPrompt } from "./prompt/shouldPrompt";

const PROMPT_ID = "npm-update";

export async function promptNpmUpdate() {
  if (!shouldPrompt(PROMPT_ID)) {
    return;
  }

  try {
    const text = execSync(`npm info ${name} --json`, {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    const { version: latestVersion } = JSON.parse(text);
    if (currentVersion !== latestVersion) {
      console.log("");
      console.log("A new version of replayio is available!");
      console.log("  Installed version:", chalk.blueBright(currentVersion));
      console.log("  New version:", chalk.blueBright(latestVersion));
      console.log("");
      console.log("To upgrade, run the following:");
      console.log(chalk.yellowBright(`  npm install -g ${name}`));
      console.log("");
      console.log("Press any key to continue");
      console.log("");

      await prompt(PROMPT_ID);
    }
  } catch (error) {
    console.error(error);
  }
}
