import { fetch } from "undici";
import { replayApiServer } from "../config";
import { logger } from "../logger";
import { getUserAgent } from "../session/getUserAgent";

export async function queryGraphQL(name: string, query: string, variables = {}, apiKey?: string) {
  const userAgent = await getUserAgent();

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    } as Record<string, string>,
    body: JSON.stringify({
      query,
      name,
      variables,
    }),
  };

  if (apiKey) {
    options.headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  logger.debug("Querying graphql endpoint", { name, replayApiServer });
  const result = await fetch(`${replayApiServer}/v1/graphql`, options);

  const json: any = await result.json();
  logger.debug("GraphQL Response", { json });

  return json;
}
