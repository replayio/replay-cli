import { ensureDirSync } from "fs-extra";
import { join } from "path";
import { runtimeMetadata, runtimePath } from "../installation/config";
import { spawnProcess } from "../spawnProcess";
import { dim } from "../theme";
import { debug } from "./debug";

export async function launchBrowser(
  url: string,
  options: {
    directory?: string;
  } = {}
) {
  const { path: executablePath, runtime } = runtimeMetadata;

  const profileDir = join(runtimePath, "profiles", runtime);
  ensureDirSync(profileDir);

  const runtimeExecutablePath = join(runtimePath, ...executablePath);
  const args = [
    url,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
  ];
  const processOptions = {
    env: {
      RECORD_ALL_CONTENT: "1",
      RECORD_REPLAY_DIRECTORY: options.directory,
    },
    stdio: undefined,
  };

  debug(
    `Launching browser: ${runtimeExecutablePath} with args:\n`,
    args.join("\n"),
    "\n",
    processOptions
  );

  console.log(`Recording ${dim("(quit browser to continue)")}`);

  await spawnProcess(runtimeExecutablePath, args, processOptions);
}