import { readFromCache, writeToCache } from "../cache";
import { cachePath } from "./cachePath";
import { AuthInfo } from "./fetchAuthInfoFromGraphQL";
import { Cached } from "./getAuthInfo";

export function updateCachedAuthInfo(accessToken: string, authInfo: AuthInfo | undefined) {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  const newCached = {
    ...cached,
  };

  if (authInfo) {
    newCached[accessToken] = authInfo;
  } else {
    delete newCached[accessToken];
  }

  writeToCache<Cached>(cachePath, newCached);
}
