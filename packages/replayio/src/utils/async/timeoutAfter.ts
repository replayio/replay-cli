type TimeoutResult = { timedOutAfter: number };

export async function timeoutAfter(duration: number): Promise<TimeoutResult> {
  const startTime = Date.now();
  return new Promise(resolve =>
    setTimeout(() => {
      const endTime = Date.now();
      resolve({ timedOutAfter: endTime - startTime });
    }, duration)
  );
}

export function isTimeoutResult(result: unknown): result is TimeoutResult {
  return result != null && typeof result === "object" && "timedOutAfter" in result;
}
