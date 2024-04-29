import { readFromCache, writeToCache } from "../cache";
import { updateLaunchDarklyCache } from "../launch-darkly/updateLaunchDarklyCache";
import { cachedAuthPath } from "./config";
import { CachedAuthDetails } from "./types";

export async function logoutIfAuthenticated() {
  let { accessToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (accessToken) {
    updateLaunchDarklyCache(accessToken, undefined);
  }

  writeToCache(cachedAuthPath, undefined);
}
