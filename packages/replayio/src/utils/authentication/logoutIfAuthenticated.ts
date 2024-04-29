import { readFromCache, writeToCache } from "../cache.js";
import { updateLaunchDarklyCache } from "../launch-darkly/updateLaunchDarklyCache.js";
import { cachedAuthPath } from "./config.js";
import { CachedAuthDetails } from "./types.js";

export async function logoutIfAuthenticated() {
  let { accessToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (accessToken) {
    updateLaunchDarklyCache(accessToken, undefined);
  }

  writeToCache(cachedAuthPath, undefined);
}
