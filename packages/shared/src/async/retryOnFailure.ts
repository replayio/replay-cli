import { timeoutAfter } from "./timeoutAfter";

async function retry<T>(
  asyncFunction: () => Promise<T>,
  backOffStrategy: (iteration: number) => number,
  onFail?: (error: unknown, attemptNumber: number, maxAttempts: number) => void,
  maxAttempts: number = 5
): Promise<T> {
  let currentAttempt = 0;
  while (currentAttempt <= maxAttempts) {
    currentAttempt++;

    try {
      return await asyncFunction();
    } catch (error) {
      if (onFail) {
        onFail(error, currentAttempt, maxAttempts);
      }

      if (currentAttempt == maxAttempts) {
        throw error;
      }

      await timeoutAfter(backOffStrategy(currentAttempt));
    }
  }

  throw Error("ShouldBeUnreachable");
}

export async function retryWithExponentialBackoff<T>(
  asyncFunction: () => Promise<T>,
  onFail?: (error: unknown, attemptNumber: number, maxAttempts: number) => void,
  maxTries?: number
): Promise<T> {
  const backoff = (iteration: number) => 2 ** iteration * 100 + jitter();

  return retry(asyncFunction, backoff, onFail, maxTries);
}

export async function retryWithLinearBackoff<T>(
  asyncFunction: () => Promise<T>,
  onFail?: (error: unknown, attemptNumber: number, maxAttempts: number) => void,
  maxTries?: number
): Promise<T> {
  const backoff = () => 100 + jitter();

  return retry(asyncFunction, backoff, onFail, maxTries);
}

// https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
function jitter(): number {
  return Math.random() * 100;
}
