import { readFromCache } from "../cache";
import { cachePath } from "./cachePath";
import { AuthIds, fetchAuthIdsFromGraphQL } from "./fetchAuthIdsFromGraphQL";
import { updateCachedAuthIds } from "./updateCachedAuthIds";

export type Cached = {
  [accessToken: string]: AuthIds;
};

async function getAuthIds(accessToken: string): Promise<AuthIds> {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  let authIds = cached[accessToken];

  if (!authIds) {
    authIds = await fetchAuthIdsFromGraphQL(accessToken);
    updateCachedAuthIds(accessToken, authIds);
  }

  return authIds;
}

export { getAuthIds };
