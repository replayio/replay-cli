// TODO [PRO-629] Move this into the "shared" package.

import { readFromCache, writeToCache } from "../cache";
import { AuthIds } from "./fetchAuthIdsFromGraphQL";
import { cachePath, Cached } from "./getAuthIds";

export function updateCachedAuthIds(accessToken: string, authIds: AuthIds) {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  const newCached = {
    ...cached,
  };

  if (authIds) {
    newCached[accessToken] = authIds;
  } else {
    delete newCached[accessToken];
  }

  writeToCache<Cached>(cachePath, newCached);
}
