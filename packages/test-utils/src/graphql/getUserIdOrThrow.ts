import { readFromCache } from "../cache";
import { fetchUserIdFromGraphQLOrThrow } from "../graphql/fetchUserIdFromGraphQLOrThrow";
import { cachePath } from "./config";
import { Cached } from "./types";
import { updateCachedUserId } from "./updateCachedUserId";

export async function getUserIdOrThrow(accessToken: string) {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  let id = cached[accessToken];
  if (!id) {
    id = await fetchUserIdFromGraphQLOrThrow(accessToken);

    updateCachedUserId(accessToken, id);
  }

  return id;
}
