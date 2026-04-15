import { fetch } from "undici";
import { replayApiServer } from "../config";
import { logDebug } from "../logger";
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

  if (process.env.REPLAY_CLIENT_SOURCE) {
    options.headers["X-Replay-Source"] = process.env.REPLAY_CLIENT_SOURCE;
  }

  logDebug("Querying graphql endpoint", { name, replayApiServer });
  const result = await fetch(`${replayApiServer}/v1/graphql`, options);

  const json: any = await result.json();
  logDebug("GraphQL Response", { json });

  return json;
}
