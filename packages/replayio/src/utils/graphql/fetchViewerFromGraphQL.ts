import { GraphQLError } from "@replay-cli/shared/graphql/GraphQLError";
import { queryGraphQL } from "@replay-cli/shared/graphql/queryGraphQL";
import { logger } from "@replay-cli/shared/logger";

export type AuthInfo = {
  userEmail: string | undefined;
  userName: string | undefined;
  teamName: string | undefined;
};

export async function fetchViewerFromGraphQL(accessToken: string): Promise<AuthInfo> {
  logger.info("FetchViewerFromGraphQL:Start");

  const { data, errors } = await queryGraphQL(
    "ViewerInfo",
    `
        query ViewerInfo {
          viewer {
            email
            user {
              name
            }
          }
          auth {
            workspaces {
              edges {
                node {
                  name
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
      email: string;
      user: {
        name: string;
      } | null;
    };
    auth: {
      workspaces: {
        edges: {
          node: {
            name: string;
          };
        }[];
      };
    };
  };

  const { viewer, auth } = response;

  return {
    userEmail: viewer?.email,
    userName: viewer?.user?.name,
    teamName: auth?.workspaces?.edges?.[0]?.node?.name,
  };
}
