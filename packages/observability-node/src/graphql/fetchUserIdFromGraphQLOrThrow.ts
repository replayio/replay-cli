// TODO [PRO-629] Move this into the "shared" package
// Duplicates https://github.com/replayio/replay-cli/blob/main/packages/replayio/src/utils/graphql/fetchUserIdFromGraphQLOrThrow.ts#L3
import debug from "debug";
import { GraphQLError } from "./GraphQLError";
import { queryGraphQL } from "./queryGraphQL";

export async function fetchUserIdFromGraphQLOrThrow(accessToken: string) {
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

  if (viewer?.user?.id) {
    return viewer.user.id;
  } else if (auth?.workspaces?.edges?.[0]?.node?.id) {
    return auth.workspaces.edges[0].node.id;
  }

  throw new Error("Unrecognized type of an API key: Missing both user ID and workspace ID.");
}
