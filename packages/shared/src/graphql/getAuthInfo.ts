import { readFromCache } from "../cache";
import { cachePath } from "./cachePath";
import { AuthInfo, fetchAuthInfoFromGraphQL } from "./fetchAuthInfoFromGraphQL";
import { updateCachedAuthInfo } from "./updateCachedAuthInfo";

export type Cached = {
  [accessToken: string]: AuthInfo;
};

export async function getAuthInfo(accessToken: string): Promise<AuthInfo> {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  let authInfo = cached[accessToken];

  if (!authInfo) {
    authInfo = await fetchAuthInfoFromGraphQL(accessToken);

    updateCachedAuthInfo(accessToken, authInfo);
  }

  return authInfo;
}
