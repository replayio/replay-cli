import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { Readable } from "stream";
import { createDeferred, Deferred } from "./async/createDeferred";

function collectData(readable: Readable | null) {
  const buffers: Uint8Array[] = [];
  readable?.on("data", data => buffers.push(data));
  return buffers;
}

export function spawnProcess(
  executablePath: string,
  args: string[] = [],
  options: SpawnOptions = {},
  {
    onSpawn,
  }: {
    onSpawn?: () => void;
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
    const stderr = collectData(spawned.stderr);

    spawned.on("error", error => {
      deferred.rejectIfPending(error);
    });

    spawned.on("spawn", () => {
      onSpawn?.();
    });

    spawned.on("exit", (code, signal) => {
      if (code) {
        const buffered = Buffer.concat(stderr).toString();

        let message = `Process failed (code: ${code})`;
        if (buffered.length) {
          message += `:\n${buffered}`;
        }
        deferred.rejectIfPending(new Error(message));
      } else {
        deferred.resolveIfPending();
      }
    });
  }

  return deferred;
}
