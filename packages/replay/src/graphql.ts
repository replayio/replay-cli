import dbg from "debug";

const debug = dbg("replay:cli:graphql");

export async function query(name: string, query: string, variables = {}) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      name,
      variables,
    }),
  };

  const server = process.env.REPLAY_API_SERVER || "https://api.replay.io";
  debug("Querying %s graphql endpoint", server);
  const result = await fetch(`${server}/v1/graphql`, options);

  const json = await result.json();
  debug("GraphQL Response: %O", json);

  return json;
}
