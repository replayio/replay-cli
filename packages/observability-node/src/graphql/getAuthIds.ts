// TODO [PRO-629] Move this into the "shared" package.

import { readFromCache } from "../cache";
import { AuthIds, fetchAuthIdsFromGraphQL } from "./fetchAuthIdsFromGraphQL";
import { updateCachedAuthIds } from "./updateCachedAuthIds";
import { getReplayPath } from "../getReplayPath";

export type Cached = {
  [accessToken: string]: AuthIds;
};

export const cachePath = getReplayPath("observability-profile", "graphql.json");

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
