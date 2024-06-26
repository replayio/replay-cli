import { isTimeoutResult, timeoutAfter } from "@replay-cli/shared/async/timeoutAfter";

export async function raceWithTimeout<Type>(
  promise: Promise<Type>,
  timeoutMs: number,
  abortController?: AbortController
): Promise<Type | undefined> {
  const result = await Promise.race([promise, timeoutAfter(timeoutMs)]);
  if (isTimeoutResult(result)) {
    if (abortController) {
      abortController.abort();
    }

    return undefined;
  }

  return result;
}
