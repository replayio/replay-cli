import { AuthInfo } from "../authentication/types";
import { logDebug } from "../logger";
import { base64Decode } from "../strings/decode";
import { GraphQLError } from "./GraphQLError";
import { queryGraphQL } from "./queryGraphQL";

export async function fetchAuthInfoFromGraphQL(accessToken: string): Promise<AuthInfo> {
  logDebug("Fetching auth info from GraphQL");

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

  const userId = viewer?.user?.id;
  const workspaceId = auth?.workspaces?.edges?.[0]?.node?.id;

  if (userId) {
    return { id: decodeId(userId), type: "user" };
  } else if (workspaceId) {
    return { id: decodeId(workspaceId), type: "workspace" };
  } else {
    throw new Error("Unrecognized type of an API key: Missing both user ID and workspace ID.");
  }
}

function decodeId(base64EncodedId: string) {
  const decoded = base64Decode(base64EncodedId); // The expected format is "w:0000-0000-0000" or "u:0000-0000-0000"
  const [_, id] = decoded.split(":");

  if (typeof id !== "string") {
    throw new Error(`Unrecognized ID format: ${base64EncodedId}`);
  }

  return id;
}
