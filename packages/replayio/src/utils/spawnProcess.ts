import { createDeferred, Deferred } from "@replay-cli/shared/async/createDeferred";
import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { ProcessError } from "./ProcessError";

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
        // Don't fail on manual closing
        if (signal === "SIGTERM") {
          deferred.resolveIfPending();
          return;
        }
        const message = `Process failed (${code ? `code: ${code}` : `signal: ${signal}`})`;

        deferred.rejectIfPending(new ProcessError(message, stderr));
      } else {
        deferred.resolveIfPending();
      }
    });
  }

  return deferred;
}
