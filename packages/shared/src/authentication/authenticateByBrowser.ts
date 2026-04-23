import open from "open";
import { timeoutAfter } from "../async/timeoutAfter";
import { writeToCache } from "../cache";
import { replayAppHost } from "../config";
import { queryGraphQL } from "../graphql/queryGraphQL";
import { hashValue } from "../hashValue";
import { logDebug } from "../logger";
import { highlight } from "../theme";
import { cachedAuthPath } from "./config";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";

// TODO [PRO-24] Change authentication to remove polling and GraphQL mutation

export type AdAttribution = Partial<{
  li_fat_id: string;
  twclid: string;
  rdt_cid: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}>;

export async function authenticateByBrowser(attribution?: AdAttribution) {
  const key = hashValue(String(globalThis.performance.now()));

  console.log("\nPlease log in or register in the browser to continue.");

  logDebug(`Launching browser to sign into Replay: ${replayAppHost}`);
  const params = new URLSearchParams({ key, source: "cli" });
  if (attribution) {
    for (const [k, v] of Object.entries(attribution)) {
      if (v) params.set(k, v);
    }
  }
  await open(`${replayAppHost}/api/browser/auth?${params}`);

  const { accessToken, refreshToken } = await pollForAuthentication(key);

  writeToCache(cachedAuthPath, { accessToken, refreshToken });

  console.log("");
  console.log(highlight("You have been signed in successfully!"));

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
  let refreshToken: string | undefined = undefined;
  while (!refreshToken) {
    try {
      refreshToken = await fetchRefreshTokenFromGraphQLOrThrow(key);
    } catch (error: any) {
      if (error?.id === "missing-request") {
        logDebug("Auth request was not found. Retrying in a few seconds...");

        await timeoutAfter(2_500);
      } else {
        throw error;
      }
    }
  }

  return await refreshAccessTokenOrThrow(refreshToken);
}
