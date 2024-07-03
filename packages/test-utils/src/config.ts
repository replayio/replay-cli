import fetch from "node-fetch";
import { warn } from "./logging";
import { logger } from "@replay-cli/shared/logger";
import { getErrorMessage } from "./legacy-cli/error";

async function queryGraphqlEndpoint(apiKey: string, name: string, query: string, variables = {}) {
  logger.info("QueryGraphqlEndpoint:Started", { name });

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
  logger.info("QueryGraphqlEndpoint", { server, name });

  const result = await fetch(`${server}/v1/graphql`, options);
  const json: any = await result.json();

  logger.info("QueryGraphqlEndpoint:Succeeded", { server, name });

  return json;
}

async function fetchWorkspaceConfig(apiKey: string) {
  try {
    const json = await queryGraphqlEndpoint(
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
      const errorMessages = json.errors.map(getErrorMessage);
      logger.error("FetchWorkspaceConfig:GraphqlFailed", { errorMessages });
      throw new Error(json.errors[0].message || "Unexpected error");
    }

    const edges = json.data?.auth.workspaces.edges;
    if (!edges || edges.length !== 1) {
      logger.error("FetchWorkspaceConfig:FailedToFindWorkspace", {
        hadEdges: !!edges,
        edgesLength: edges?.length ?? null,
      });

      throw new Error("Failed to find a workspace for the given apiKey");
    }

    logger.info("FetchWorkspaceConfig", { workspaceSettings: edges[0].node.settings });

    const features = edges[0].node.settings.features;

    return {
      env: features?.testSuites?.env || {},
    };
  } catch (error) {
    warn("Failed to fetch test suite configuration; continuing with defaults", error);
    logger.error("FetchWorkspaceConfig:Failed", { error });

    return {
      env: {},
    };
  }
}

export { fetchWorkspaceConfig };
