import assert from "assert";
import { ensureDirSync, existsSync } from "fs-extra";
import { join } from "path";
import { createDeferred } from "../async/createDeferred";
import { runtimeMetadata, runtimePath } from "../installation/config";
import { prompt } from "../prompt/prompt";
import { spawnProcess } from "../spawnProcess";
import { dim } from "../theme";
import { debug } from "./debug";

export async function launchBrowser(
  url: string,
  options: {
    directory?: string;
    processGroupId: string;
  }
) {
  const { path: executablePath, runtime } = runtimeMetadata;
  const { directory, processGroupId } = options;

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
      RECORD_REPLAY_DIRECTORY: directory,
      RECORD_REPLAY_METADATA: JSON.stringify({ processGroupId }),
    },
    stdio: undefined,
  };

  if (!existsSync(runtimeExecutablePath)) {
    debug(`Replay browser not found at: ${runtimeExecutablePath}`);

    return false;
  }

  debug(
    `Launching browser: ${runtimeExecutablePath} with args:\n`,
    args.join("\n"),
    "\n",
    processOptions
  );

  // Wait until the user quits the browser process OR
  // until the user presses a key to continue (in which case, we will kill the process)
  const abortControllerForPrompt = new AbortController();
  const browserClosedDeferred = createDeferred<void>();

  const { data: childProcess } = spawnProcess(runtimeExecutablePath, args, processOptions, {
    onError: (error: Error) => {
      abortControllerForPrompt.abort();
      browserClosedDeferred.rejectIfPending(error);
    },
    onExit: () => {
      abortControllerForPrompt.abort();
      browserClosedDeferred.resolveIfPending();
    },
    onSpawn: () => {
      console.log(`Recording ${dim("(press any key to stop recording)")}`);

      prompt({
        abortSignal: abortControllerForPrompt.signal,
      }).then(() => {
        assert(childProcess);
        childProcess.kill();
      });
    },
  });

  await browserClosedDeferred.promise;

  return true;
}
