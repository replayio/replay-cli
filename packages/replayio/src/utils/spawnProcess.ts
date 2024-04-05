import { spawn, SpawnOptions } from "child_process";

export async function spawnProcess(
  executablePath: string,
  args: string[] = [],
  options: SpawnOptions = {}
) {
  return new Promise<void>((resolve, reject) => {
    const spawned = spawn(executablePath, args, {
      stdio: "inherit",
      ...options,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    if (options?.detached) {
      // TODO [PRO-*] Properly handle detached processes
      // github.com/replayio/replay-cli/pull/344#discussion_r1553258356
      spawned.unref();
    } else {
      spawned.on("error", error => {
        reject(error);
      });
      spawned.on("exit", (code, signal) => {
        if (code || signal) {
          reject(new Error(`Process failed (code: ${code}, signal: ${signal})`));
        } else {
          resolve();
        }
      });
    }
  });
}
