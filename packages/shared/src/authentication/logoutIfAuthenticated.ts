import { readFromCache, writeToCache } from "../cache";
import { updateCachedAuthInfo } from "../graphql/updateCachedAuthInfo";
import { cachedAuthPath } from "./config";
import { CachedAuthDetails } from "./types";

export async function logoutIfAuthenticated() {
  let { accessToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (accessToken) {
    updateCachedAuthInfo(accessToken, undefined);
  }

  writeToCache(cachedAuthPath, undefined);
}
