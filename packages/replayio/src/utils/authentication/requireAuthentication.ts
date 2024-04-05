import { spawn } from "child_process";
import { replayAppHost } from "../../config";
import { writeToCache } from "../cache";
import { exitProcess } from "../exitProcess";
import { getSystemOpenCommand } from "../getSystemOpenCommand";
import { queryGraphQL } from "../graphql/queryGraphQL";
import { hashValue } from "../hashValue";
import { initLaunchDarklyFromAccessToken } from "../launch-darkly/initLaunchDarklyFromAccessToken";
import { wait } from "../wait";
import { cachedAuthPath } from "./config";
import { debug } from "./debug";
import { getAccessToken } from "./getAccessToken";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";

// TODO [PRO-24] Change authentication to remove polling and GraphQL mutation

export async function requireAuthentication(verbose: boolean) {
  let savedAccessToken = await getAccessToken();
  if (savedAccessToken) {
    if (verbose) {
      console.log("You are already signed in!");
    }

    return savedAccessToken;
  }

  const key = hashValue(String(globalThis.performance.now()));

  console.log("Please sign-in to Replay in your browser to continue.");

  debug(`Launching browser to sign into Replay: ${replayAppHost}`);
  spawn(getSystemOpenCommand(), [`${replayAppHost}/api/browser/auth?key=${key}&source=cli`]);

  const { accessToken, refreshToken } = await pollForAuthentication(key);

  writeToCache(cachedAuthPath, { accessToken, refreshToken });

  if (verbose) {
    console.log("You have been signed in successfully!");
  }

  // (Re)initialize LaunchDarkly for the newly authenticated user
  await initLaunchDarklyFromAccessToken(accessToken);

  return accessToken;
}

async function fetchRefreshTokenFromGraphQLOrThrow(key: string) {
  const { data, errors } = await queryGraphQL(
    "CloseAuthRequest",
    `
        mutation CloseAuthRequest($key: String!) {
          closeAuthRequest(input: {key: $key}) {
            success
            token
          }
        }
      `,
    {
      key,
    }
  );

  if (errors) {
    if (errors.length === 1 && errors[0].message === "Authentication request does not exist") {
      throw {
        id: "missing-request",
      };
    } else {
      throw {
        id: "close-graphql-error",
        message: errors
          .map((e: any) => e.message)
          .filter(Boolean)
          .join(", "),
      };
    }
  } else if (!data.closeAuthRequest.token) {
    throw {
      id: "close-missing-token",
      message: JSON.stringify(data),
    };
  }

  return data.closeAuthRequest.token as string;
}

async function pollForAuthentication(key: string) {
  const timeout = setTimeout(() => {
    debug("Timed out waiting for authentication");

    exitProcess(1);
  }, 60_000);

  let refreshToken: string | undefined = undefined;
  while (!refreshToken) {
    try {
      refreshToken = await fetchRefreshTokenFromGraphQLOrThrow(key);
    } catch (error: any) {
      if (error?.id === "missing-request") {
        debug("Auth request was not found. Retrying in a few seconds...");

        await wait(2_500);
      } else {
        throw error;
      }
    }
  }

  const accessToken = await refreshAccessTokenOrThrow(refreshToken);

  clearTimeout(timeout);

  return { accessToken, refreshToken };
}
