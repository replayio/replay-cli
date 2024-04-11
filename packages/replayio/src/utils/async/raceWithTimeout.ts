import { isTimeoutResult, timeoutAfter } from "./timeoutAfter";

export async function raceWithTimeout<Type>(
  promise: Promise<Type>,
  timeoutMs: number,
  externalAbortController?: AbortController
): Promise<Type | undefined> {
  const internalAbortController = new AbortController();

  const result = await Promise.race([
    promise,
    timeoutAfter(timeoutMs, { abortSignal: internalAbortController?.signal }),
  ]);

  if (isTimeoutResult(result)) {
    if (externalAbortController) {
      externalAbortController.abort();
    }

    return undefined;
  } else {
    internalAbortController.abort();

    return result;
  }
}
