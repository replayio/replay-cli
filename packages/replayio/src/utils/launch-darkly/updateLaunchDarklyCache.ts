import { readFromCache, writeToCache } from "../cache";
import { cachePath } from "./config";
import { Cached } from "./types";

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
