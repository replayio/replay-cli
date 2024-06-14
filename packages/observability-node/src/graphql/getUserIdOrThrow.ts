import { readFromCache } from "../cache";
import { fetchUserIdFromGraphQLOrThrow } from "../graphql/fetchUserIdFromGraphQLOrThrow";
import { updateCachedUserId } from "./updateCachedUserId";
import { getReplayPath } from "../getReplayPath";
import { Cached } from "../types";

export const cachePath = getReplayPath("profile", "graphql.json");

async function getUserIdOrThrow(accessToken: string) {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  let id = cached[accessToken];
  if (!id) {
    id = await fetchUserIdFromGraphQLOrThrow(accessToken);

    updateCachedUserId(accessToken, id);
  }

  return Buffer.from(id, "base64").toString();
}

export { getUserIdOrThrow };
