import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { createDeferred, Deferred } from "./async/createDeferred";

export function spawnProcess(
  executablePath: string,
  args: string[] = [],
  options: SpawnOptions = {},
  {
    onSpawn,
    printStderr,
    printStdout,
  }: {
    onSpawn?: () => void;
    printStderr?: (text: string) => void;
    printStdout?: (text: string) => void;
  } = {}
): Deferred<void, ChildProcess> {
  const spawned = spawn(executablePath, args, {
    stdio: "inherit",
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  const deferred = createDeferred<void, ChildProcess>(spawned);

  if (options?.detached) {
    // TODO [PRO-*] Properly handle detached processes
    // github.com/replayio/replay-cli/pull/344#discussion_r1553258356
    spawned.unref();
  } else {
    spawned.on("error", error => {
      deferred.rejectIfPending(error);
    });

    spawned.on("spawn", () => {
      onSpawn?.();
    });

    let stderr = "";
    spawned.stderr?.setEncoding("utf8");
    spawned.stderr?.on("data", (data: string) => {
      stderr += data;
      printStderr?.(data);
    });

    if (printStdout) {
      spawned.stdout?.setEncoding("utf8");
      spawned.stdout?.on("data", printStdout);
    }

    spawned.on("exit", (code, signal) => {
      if (code || signal) {
        let message = `Process failed (${code ? `code: ${code}` : `signal: ${signal}`})`;
        if (stderr.length) {
          message += `:\n${stderr}`;
        }
        deferred.rejectIfPending(new Error(message));
      } else {
        deferred.resolveIfPending();
      }
    });
  }

  return deferred;
}
