import fetch from "node-fetch";
import { graphQLServer } from "../../config";
import { getUserAgent } from "../getUserAgent";
import { debug } from "./debug";

export async function queryGraphQL(name: string, query: string, variables = {}, apiKey?: string) {
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

  debug("Querying %s over %s graphql endpoint", name, graphQLServer);
  const result = await fetch(`${graphQLServer}/v1/graphql`, options);

  const json: any = await result.json();
  debug("GraphQL Response: %O", json);

  return json;
}
