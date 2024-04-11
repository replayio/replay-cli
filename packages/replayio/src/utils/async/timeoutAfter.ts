type TimeoutResult = { resolution: "cancelled" | "timed-out" };

export async function timeoutAfter(
  duration: number,
  options: {
    abortSignal?: AbortSignal;
    throwOnTimeout?: boolean;
  } = {}
): Promise<TimeoutResult> {
  const { abortSignal, throwOnTimeout = false } = options;

  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const endTime = Date.now();

      if (throwOnTimeout) {
        reject(new Error(`Timed out after ${endTime - startTime}ms`));
      } else {
        resolve({ resolution: "timed-out" });
      }
    }, duration);

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        clearTimeout(timeout);

        resolve({ resolution: "cancelled" });
      });
    }
  });
}

export function isTimeoutResult(result: unknown): result is TimeoutResult {
  return result != null && typeof result === "object" && "timedOutAfter" in result;
}
