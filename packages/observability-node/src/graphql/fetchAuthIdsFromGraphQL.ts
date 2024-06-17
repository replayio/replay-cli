// TODO [PRO-629] Move this into the "shared" package.

import debug from "debug";
import { GraphQLError } from "./GraphQLError";
import { queryGraphQL } from "./queryGraphQL";
import { base64Decode } from "../strings/decode";

export type AuthIds = { userId: string | null; workspaceId: string | null };

export async function fetchAuthIdsFromGraphQL(accessToken: string): Promise<AuthIds> {
  debug("Fetching auth info from GraphQL");

  const { data, errors } = await queryGraphQL(
    "AuthInfo",
    `
        query AuthInfo {
          viewer {
            user {
              id
            }
          }
          auth {
            workspaces {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
          `,
    {},
    accessToken
  );

  if (errors) {
    throw new GraphQLError("Failed to fetch auth info", errors);
  }

  const response = data as {
    viewer: {
      user: {
        id: string | null;
      } | null;
    };
    auth: {
      workspaces: {
        edges: {
          node: {
            id: string;
          };
        }[];
      };
    };
  };

  const { viewer, auth } = response;

  const userId = viewer?.user?.id ?? null;
  const workspaceId = auth.workspaces.edges[0].node.id ?? null;

  if (!userId && !workspaceId) {
    throw new Error("Unrecognized type of an API key: Missing both user ID and workspace ID.");
  }

  return {
    userId: userId ? base64Decode(userId) : null,
    workspaceId: workspaceId ? base64Decode(workspaceId) : null,
  };
}
