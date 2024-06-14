// TODO [PRO-629] Move this into the "shared" package.

import { readFromCache, writeToCache } from "../cache";
import { Cached } from "../types";
import { cachePath } from "./getUserIdOrThrow";

export function updateCachedUserId(accessToken: string, id: string | undefined) {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  const newCached = {
    ...cached,
  };

  if (id) {
    newCached[accessToken] = id;
  } else {
    delete newCached[accessToken];
  }

  writeToCache<Cached>(cachePath, newCached);
}
