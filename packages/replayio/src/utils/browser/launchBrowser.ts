import findProcess from "find-process";
import { ensureDirSync, existsSync } from "fs-extra";
import { join } from "path";
import { retryWithLinearBackoff } from "../async/retry";
import { timeoutAfter } from "../async/timeoutAfter";
import { getReplayPath } from "../getReplayPath";
import { runtimeMetadata, runtimePath } from "../installation/config";
import { prompt } from "../prompt/prompt";
import { spawnProcess } from "../spawnProcess";
import { dim, highlight, stderrPrefix, stdoutPrefix } from "../theme";
import { debug } from "./debug";
import { getBrowserPath } from "./getBrowserPath";

export async function launchBrowser(
  url: string,
  options: {
    processGroupId: string;
    verbose?: boolean;
  }
) {
  const { processGroupId, verbose } = options;

  const profileDir = join(runtimePath, "profiles", runtimeMetadata.runtime);
  ensureDirSync(profileDir);

  const browserExecutablePath = getBrowserPath();
  const args = [
    url,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
  ];
  const processOptions = {
    env: {
      RECORD_ALL_CONTENT: "1",
      RECORD_REPLAY_DIRECTORY: getReplayPath(),
      RECORD_REPLAY_METADATA: JSON.stringify({ processGroupId }),
      RECORD_REPLAY_VERBOSE: verbose ? "1" : undefined,
    },
    stdio: undefined,
  };

  if (!existsSync(browserExecutablePath)) {
    debug(`Replay browser not found at: ${browserExecutablePath}`);
    throw new Error(`Replay browser not found at: ${browserExecutablePath}`);
  }

  const processes = await findProcess("name", browserExecutablePath);
  if (processes.length > 0) {
    const match = processes[0];

    debug(`Browser process already running at ${highlight(match.pid)}`);

    console.log(`Recording... ${dim("(quit the Replay Browser to stop recording)")}`);

    // Ask the browser to open a new tab
    spawnProcess(browserExecutablePath, args, processOptions);

    // The best we can do in this case is to regularly poll to see when the process exits
    await retryWithLinearBackoff(
      async () => {
        await timeoutAfter(1_000);
        const processes = await findProcess("name", browserExecutablePath);
        if (processes.length > 0) {
          throw Error("Still running");
        }
      },
      undefined,
      Number.POSITIVE_INFINITY
    );
  } else {
    debug(
      `Launching browser: ${browserExecutablePath} with args:\n`,
      args.join("\n"),
      "\n",
      processOptions
    );

    // Wait until the user quits the browser process OR
    // until the user presses a key to continue (in which case, we will kill the process)
    const abortControllerForPrompt = new AbortController();

    const spawnDeferred = spawnProcess(browserExecutablePath, args, processOptions, {
      onSpawn: () => {
        if (process.stdin.isTTY) {
          console.log(`Recording... ${dim("(press any key to stop recording)")}`);

          prompt({
            signal: abortControllerForPrompt.signal,
          }).then(() => {
            spawnDeferred.data.kill();
          });
        } else {
          console.log(`Recording... ${dim("(quit the Replay Browser to stop recording)")}`);
        }
      },
      printStderr: (text: string) => {
        debug(stderrPrefix("stderr"), text);
      },
      printStdout: (text: string) => {
        debug(stdoutPrefix("stdout"), text);
      },
    });

    try {
      await spawnDeferred.promise;
    } finally {
      abortControllerForPrompt.abort();
    }
  }
}
