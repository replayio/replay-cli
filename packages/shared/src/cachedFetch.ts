import { fetch } from "undici";
import { createDeferred, Deferred } from "./async/createDeferred";
import { timeoutAfter } from "./async/timeoutAfter";

type CacheEntry = {
  json: any | null;
  ok: boolean;
  status: number;
  statusText: string;
};

export const cache: Map<
  string,
  | {
      deferred: Deferred<CacheEntry>;
      entry: undefined;
    }
  | { deferred: undefined; entry: CacheEntry }
> = new Map();

type ShouldRetryValue = boolean | { after: number };

/** This method should not be used for GraphQL queries because it caches responses by URL. */
export async function cachedFetch(
  url: string,
  init?: RequestInit,
  options: {
    baseDelay?: number;
    maxAttempts?: number;
    shouldRetry?: (
      response: Response,
      json: unknown,
      defaultDelay: number
    ) => Promise<ShouldRetryValue> | ShouldRetryValue;
  } = {}
): Promise<CacheEntry> {
  const { baseDelay = 1_000, maxAttempts = 3, shouldRetry: shouldRetryFn } = options;

  const cached = cache.get(url);

  if (cached) {
    if (cached.entry) {
      return cached.entry;
    }
    return cached.deferred.promise;
  }

  const deferred = createDeferred<CacheEntry>();
  cache.set(url, { deferred, entry: undefined });

  let attempt = 1;

  while (true) {
    // Retry with exponential backoff (e.g. 1s, 2s, 4s, ...) by default
    let retryAfter = Math.pow(2, attempt) * baseDelay;
    try {
      const resp = await fetch(url, init);
      const json = await resp.json().catch(() => null);

      if (resp.ok) {
        return storeCachedEntry(url, deferred, {
          json,
          ok: true,
          status: resp.status,
          statusText: resp.statusText,
        });
      }

      let shouldRetry = attempt < maxAttempts;

      if (shouldRetry && shouldRetryFn) {
        const shouldRetryResult = await shouldRetryFn(resp, json, retryAfter);

        shouldRetry = !!shouldRetryResult;

        if (!shouldRetry) {
          return storeCachedEntry(url, deferred, {
            json,
            ok: false,
            status: resp.status,
            statusText: resp.statusText,
          });
        }
        if (typeof shouldRetryResult === "object" && typeof shouldRetryResult.after === "number") {
          retryAfter = shouldRetryResult.after;
        }
      }
      // If we've run out of retries, store and return the error
      if (!shouldRetry) {
        return storeCachedEntry(url, deferred, {
          json,
          ok: false,
          status: resp.status,
          statusText: resp.statusText,
        });
      }
    } catch (error) {
      // most likely it's a network failure, there is no need to call shouldRetryFn
      // but we should only retry if we haven't reached the maxAttempts yet
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await timeoutAfter(retryAfter);
    attempt++;
  }
}

export function resetCache(url?: string) {
  if (url) {
    cache.delete(url);
  } else {
    cache.clear();
  }
}

function storeCachedEntry(
  url: string,
  deferred: Deferred<CacheEntry, undefined>,
  entry: CacheEntry
) {
  deferred.resolve(entry);
  cache.set(url, { deferred: undefined, entry });
  return entry;
}
