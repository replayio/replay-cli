import fetch from "node-fetch";
import dbg from "debug";
import { warn } from "./logging";

const debug = dbg("replay:test-utils:config");

async function query(apiKey: string, name: string, query: string, variables = {}) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
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
  const json: any = await result.json();

  return json;
}

async function fetchWorkspaceConfig(apiKey: string) {
  try {
    const json = await query(
      apiKey,
      "GetWorkspaceConfig",
      `
        query GetWorkspaceConfig {
          auth {
            workspaces {
              edges {
                node {
                  id
                  settings {
                    features
                  }
                }
              }
            }
          }
        }`
    );

    if (json.errors) {
      debug("GraphQL failed: %s", json.errors);
      throw new Error(json.errors[0].message || "Unexpected error");
    }

    const edges = json.data?.auth.workspaces.edges;
    if (!edges || edges.length !== 1) {
      debug("Failed to find workspace: %o", json.data);
      throw new Error("Failed to find a workspace for the given apiKey");
    }

    debug("Workspace settings: %o", edges[0].node.settings);
    const features = edges[0].node.settings.features;

    return {
      env: features?.testSuites?.env || {},
    };
  } catch (e) {
    warn("Failed to fetch test suite configuration; continuing with defaults", e);

    return {
      env: {},
    };
  }
}

export { fetchWorkspaceConfig };
