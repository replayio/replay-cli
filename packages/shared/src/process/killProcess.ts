import findProcess from "find-process";
import { kill } from "process";
import { createDeferred } from "../async/createDeferred";
import { timeoutAfter } from "../async/timeoutAfter";

export async function killProcess(
  pid: number,
  signal?: string | number | undefined,
  options: { retryIntervalMs?: number; timeoutMs?: number } = {}
): Promise<boolean> {
  const { retryIntervalMs = 100, timeoutMs = 1_000 } = options;

  const deferred = createDeferred<boolean>();

  let timeout: NodeJS.Timeout | undefined;

  const tryToKill = async () => {
    timeout = undefined;

    const process = await findProcess("pid", pid);
    if (process.length === 0) {
      deferred.resolve(true);
    } else {
      kill(pid, signal);

      timeout = setTimeout(tryToKill, retryIntervalMs);
    }
  };

  tryToKill();

  return Promise.race([
    deferred.promise.then(() => {
      clearTimeout(timeout);

      return true;
    }),
    timeoutAfter(timeoutMs).then(() => false),
  ]);
}
