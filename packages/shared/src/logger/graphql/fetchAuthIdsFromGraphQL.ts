import { GraphQLError } from "./GraphQLError";
import { queryGraphQL } from "./queryGraphQL";
import { base64Decode } from "../strings/decode";
import { logger } from "../logger";

export type AuthIds = { userId: string | null; workspaceId: string | null };

export async function fetchAuthIdsFromGraphQL(accessToken: string): Promise<AuthIds> {
  logger.debug("Fetching auth info from GraphQL");

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
  const workspaceId = auth?.workspaces?.edges?.[0]?.node?.id ?? null;

  if (!userId && !workspaceId) {
    throw new Error("Unrecognized type of an API key: Missing both user ID and workspace ID.");
  }

  return {
    userId: userId ? formatId(userId) : null,
    workspaceId: workspaceId ? formatId(workspaceId) : null,
  };
}

function formatId(base64EncodedId: string) {
  const decoded = base64Decode(base64EncodedId); // The expected format is "w:0000-0000-0000" or "u:0000-0000-0000"
  const [_, id] = decoded.split(":");

  if (typeof id !== "string") {
    throw new Error(`Unrecognized ID format: ${base64EncodedId}`);
  }

  return id;
}
