import { readFromCache, writeToCache } from "../cache.js";
import { cachePath } from "./config.js";
import { Cached } from "./types.js";

export function updateLaunchDarklyCache(accessToken: string, id: string | undefined) {
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
