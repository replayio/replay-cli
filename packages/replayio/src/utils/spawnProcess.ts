import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { createDeferred, Deferred } from "./createDeferred";

export function spawnProcess(
  executablePath: string,
  args: string[] = [],
  options: SpawnOptions = {},
  callbacks: {
    onError?: (error: Error) => void;
    onExit?: () => void;
    onSpawn?: () => void;
  } = {}
): Deferred<void, ChildProcess> {
  const { onError, onExit, onSpawn } = callbacks;

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

      if (onError) {
        onError(error);
      }
    });

    spawned.on("spawn", () => {
      if (onSpawn) {
        onSpawn();
      }
    });

    spawned.on("exit", (code, signal) => {
      if (code || signal) {
        deferred.rejectIfPending(new Error(`Process failed (code: ${code}, signal: ${signal})`));
      } else {
        deferred.resolveIfPending();
      }

      if (onExit) {
        onExit();
      }
    });
  }

  return deferred;
}
