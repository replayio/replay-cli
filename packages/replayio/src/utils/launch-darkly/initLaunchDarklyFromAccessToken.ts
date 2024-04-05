import { readFromCache } from "../cache";
import { queryGraphQL } from "../graphql/queryGraphQL";
import { cachePath } from "./config";
import { debug } from "./debug";
import { identifyUserProfile } from "./identifyUserProfile";
import { Cached } from "./types";
import { updateLaunchDarklyCache } from "./updateLaunchDarklyCache";

export async function initLaunchDarklyFromAccessToken(accessToken: string) {
  debug("Initializing LaunchDarkly profile");

  try {
    const cached = readFromCache<Cached>(cachePath) ?? {};
    let id = cached[accessToken];
    if (!id) {
      id = await fetchUserIdFromGraphQLOrThrow(accessToken);

      updateLaunchDarklyCache(accessToken, id);
    }

    debug("Found cached user id %s", id);

    if (id) {
      await identifyUserProfile(id);
    }
  } catch (error) {
    console.error(error);
  }
}

async function fetchUserIdFromGraphQLOrThrow(accessToken: string) {
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
    {
      key: accessToken,
    },
    accessToken
  );

  if (errors) {
    console.error(errors);

    throw new Error("Failed to fetch auth info");
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
