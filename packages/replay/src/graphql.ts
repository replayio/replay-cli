import dbg from "./debug";
import fetch from "node-fetch";
import { getUserAgent } from "./utils";

const debug = dbg("replay:cli:graphql");

export async function query(name: string, query: string, variables = {}, apiKey?: string) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": getUserAgent(),
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

  const server = process.env.REPLAY_API_SERVER || "https://api.replay.io";
  debug("Querying %s over %s graphql endpoint", name, server);
  const result = await fetch(`${server}/v1/graphql`, options);

  const json = await result.json();
  debug("GraphQL Response: %O", json);

  return json;
}
