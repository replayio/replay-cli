type TimeoutResult = { timedOutAfter: number };

export async function timeoutAfter(
  duration: number,
  throwOnTimeout: boolean = false
): Promise<TimeoutResult> {
  const startTime = Date.now();
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      const endTime = Date.now();

      if (throwOnTimeout) {
        reject(new Error(`Timed out after ${endTime - startTime}ms`));
      } else {
        resolve({ timedOutAfter: endTime - startTime });
      }
    }, duration)
  );
}

export function isTimeoutResult(result: unknown): result is TimeoutResult {
  return result != null && typeof result === "object" && "timedOutAfter" in result;
}
