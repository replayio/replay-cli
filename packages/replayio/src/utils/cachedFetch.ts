type CacheEntry = { json: any | null; status: number; statusText: string };

export const cache: Map<string, CacheEntry> = new Map();

// Note that this method should not be used for GraphQL queries because it caches responses by URL.
// TODO [PRO-676] Move this into the "shared" package
export async function cachedFetch(
  url: string,
  init?: RequestInit,
  options: {
    baseDelay?: number;
    maxAttempts?: number;
    shouldRetry?: (response: Response) => Promise<boolean>;
  } = {}
): Promise<CacheEntry> {
  const { baseDelay = 1_000, maxAttempts = 3, shouldRetry: shouldRetryFn } = options;

  let attempt = 0;

  while (!cache.has(url)) {
    attempt++;

    const resp = await fetch(url, init);
    if (resp.status === 200) {
      const json = await resp.json();
      cache.set(url, {
        json,
        status: resp.status,
        statusText: resp.statusText,
      });
    } else if (attempt < maxAttempts) {
      if (shouldRetryFn) {
        const shouldRetry = await shouldRetryFn(resp);
        if (!shouldRetry) {
          cache.set(url, {
            json: null,
            status: resp.status,
            statusText: resp.statusText,
          });
          break;
        }
      }

      // Retry with exponential backoff (e.g. 1s, 2s, 4s, ...)
      const delay = Math.pow(2, attempt) * baseDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      // If we've run out of retries, store and return the error
      cache.set(url, {
        json: null,
        status: resp.status,
        statusText: resp.statusText,
      });
    }
  }

  return cache.get(url)!;
}

export function resetCache(url?: string) {
  if (url) {
    cache.delete(url);
  } else {
    cache.clear();
  }
}
