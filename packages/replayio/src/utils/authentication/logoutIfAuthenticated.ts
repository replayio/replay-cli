import { readFromCache, writeToCache } from "../cache";
import { updateCachedUserId } from "../graphql/updateCachedUserId";
import { cachedAuthPath } from "./config";
import { CachedAuthDetails } from "./types";

export async function logoutIfAuthenticated() {
  let { accessToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (accessToken) {
    updateCachedUserId(accessToken, undefined);
  }

  writeToCache(cachedAuthPath, undefined);
}
