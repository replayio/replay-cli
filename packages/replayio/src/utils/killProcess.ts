import findProcess from "find-process";
import { kill } from "process";
import { createDeferred } from "./async/createDeferred";
import { isTimeoutResult, timeoutAfter } from "./async/timeoutAfter";

export async function killProcess(
  pid: number,
  signal?: string | number | undefined,
  options: { retryIntervalMs?: number; timeoutMs?: number } = {}
): Promise<boolean> {
  const { retryIntervalMs = 100, timeoutMs = 1_000 } = options;

  const deferred = createDeferred<boolean>();

  const tryToKill = async () => {
    const process = await findProcess("pid", pid);
    if (process.length === 0) {
      deferred.resolve(true);
    } else {
      kill(pid, signal);

      setTimeout(tryToKill, retryIntervalMs);
    }
  };

  tryToKill();

  const result = await Promise.race([deferred.promise, timeoutAfter(timeoutMs)]);

  return !isTimeoutResult(result);
}
