import { readFromCache } from "../cache";
import { cachePath } from "../graphql/cachePath";
import { fetchAuthInfoFromGraphQL } from "../graphql/fetchAuthInfoFromGraphQL";
import { updateCachedAuthInfo } from "../graphql/updateCachedAuthInfo";
import { AuthInfo } from "./types";

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
