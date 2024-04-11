import { exec } from "child_process";
import { promisify } from "util";
import { PackageManager } from "./types";

const execAsync = promisify(exec);

export async function getLatestPackageVersion(command: PackageManager, packageName: string) {
  try {
    switch (command) {
      case "npm":
      case "pnpm": {
        const { stdout: text } = await execAsync(`${command} info ${packageName} --json`, {
          encoding: "utf8",
        });
        const json = JSON.parse(text.trim());

        return json.version;
      }
      case "yarn": {
        const { stdout: text } = await execAsync(`yarn npm info ${packageName} --json`, {
          encoding: "utf8",
        });
        const json = JSON.parse(text.trim());

        return json["dist-tags"]?.latest;
      }
    }
  } catch (error) {
    // Ignore
  }
}
