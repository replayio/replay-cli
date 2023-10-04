import dbg from "debug";
import fetch from "node-fetch";

const debug = dbg("replay:cli:graphql");

export async function query(name: string, query: string, variables = {}, apiKey?: string) {

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const options = {
    method: "POST",
    headers: headers,
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


export async function queryHasura(name: string, query: string, variables: object) {
  if (!process.env.HASURA_API_KEY) {
    throw new Error("HASURA_API_KEY needs to be first set in your environment variables")
  }

  const queryRes = await fetch("https://graphql.replay.io/v1/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": process.env.HASURA_API_KEY || "",
    },
    body: JSON.stringify({
      name,
      query,
      variables: variables,
    }),
  });

  const res = await queryRes.json();
  return res;
}
