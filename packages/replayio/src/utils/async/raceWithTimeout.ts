import { isTimeoutResult, timeoutAfter } from "./timeoutAfter";

export async function raceWithTimeout<Type>(
  promise: Promise<Type>,
  timeoutMs: number,
  abortController?: AbortController
): Promise<Type> {
  const result = await Promise.race([promise, timeoutAfter(timeoutMs)]);
  if (isTimeoutResult(result)) {
    if (abortController) {
      abortController.abort();
    }

    throw new Error(`Timed out after ${result.timedOutAfter}ms`);
  }

  return result;
}
