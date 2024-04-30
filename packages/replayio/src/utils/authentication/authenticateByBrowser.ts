import { spawn } from "child_process";
import { replayAppHost } from "../../config";
import { raceWithTimeout } from "../async/raceWithTimeout";
import { timeoutAfter } from "../async/timeoutAfter";
import { writeToCache } from "../cache";
import { getSystemOpenCommand } from "../getSystemOpenCommand";
import { queryGraphQL } from "../graphql/queryGraphQL";
import { hashValue } from "../hashValue";
import { AuthenticationError } from "./AuthenticationError";
import { cachedAuthPath } from "./config";
import { debug } from "./debug";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";

// TODO [PRO-24] Change authentication to remove polling and GraphQL mutation

export async function authenticateByBrowser() {
  const key = hashValue(String(globalThis.performance.now()));

  console.log("Please log in or register to continue.");

  debug(`Launching browser to sign into Replay: ${replayAppHost}`);
  spawn(getSystemOpenCommand(), [`${replayAppHost}/api/browser/auth?key=${key}&source=cli`]);

  const result = await raceWithTimeout(pollForAuthentication(key), 60_000);
  if (result == null) {
    throw new AuthenticationError("time-out", "Timed out waiting for authentication");
  }

  const { accessToken, refreshToken } = result;

  writeToCache(cachedAuthPath, { accessToken, refreshToken });

  console.log("You have been signed in successfully!");

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

export async function pollForAuthentication(key: string) {
  let refreshToken: string | undefined = undefined;
  while (!refreshToken) {
    try {
      refreshToken = await fetchRefreshTokenFromGraphQLOrThrow(key);
    } catch (error: any) {
      if (error?.id === "missing-request") {
        debug("Auth request was not found. Retrying in a few seconds...");

        await timeoutAfter(2_500);
      } else {
        throw error;
      }
    }
  }

  const accessToken = await refreshAccessTokenOrThrow(refreshToken);

  return { accessToken, refreshToken };
}
