import { readFromCache, writeToCache } from "../cache";
import { updateCachedAuthInfo } from "../graphql/updateCachedAuthInfo";
import { logDebug } from "../logger";
import { maskString } from "../maskString";
import { cachedAuthPath } from "./config";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";
import { CachedAuthDetails } from "./types";

export type AccessTokenInfo = {
  accessToken: string | undefined;
  apiKeySource: "REPLAY_API_KEY" | "RECORD_REPLAY_API_KEY" | undefined;
};

const NO_ACCESS_TOKEN: AccessTokenInfo = {
  accessToken: undefined,
  apiKeySource: undefined,
};

export async function getAccessToken(): Promise<AccessTokenInfo> {
  if (process.env.REPLAY_API_KEY) {
    logDebug("Using token from env (REPLAY_API_KEY)");
    return {
      accessToken: process.env.REPLAY_API_KEY,
      apiKeySource: "REPLAY_API_KEY",
    };
  } else if (process.env.RECORD_REPLAY_API_KEY) {
    logDebug("Using token from env (RECORD_REPLAY_API_KEY)");
    return {
      accessToken: process.env.RECORD_REPLAY_API_KEY,
      apiKeySource: "RECORD_REPLAY_API_KEY",
    };
  }

  let { accessToken, refreshToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (typeof accessToken !== "string") {
    logDebug("Unexpected accessToken value", { accessToken });
    return NO_ACCESS_TOKEN;
  }
  if (typeof refreshToken !== "string") {
    logDebug("Unexpected refreshToken", { refreshToken });
    return NO_ACCESS_TOKEN;
  }

  const [_, encodedToken, __] = accessToken.split(".", 3);
  if (typeof encodedToken !== "string") {
    logDebug("Token did not contain a valid payload", { accessToken: maskString(accessToken) });
    return NO_ACCESS_TOKEN;
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(encodedToken, "base64").toString());
  } catch (error) {
    logDebug("Failed to decode token", { accessToken: maskString(accessToken), error });
    return NO_ACCESS_TOKEN;
  }

  if (typeof payload !== "object") {
    logDebug("Token payload was not an object");
    return NO_ACCESS_TOKEN;
  }

  const expiration = (payload?.exp ?? 0) * 1000;
  const expirationDate = new Date(expiration);
  const hasTokenExpired = expiration - Date.now() <= 0;
  if (hasTokenExpired) {
    logDebug(`Access token expired at ${expirationDate.toLocaleDateString()}`);

    try {
      const refreshedTokens = await refreshAccessTokenOrThrow(refreshToken);
      writeToCache(cachedAuthPath, refreshedTokens);
      accessToken = refreshedTokens.accessToken;
    } catch (error) {
      writeToCache(cachedAuthPath, undefined);
      updateCachedAuthInfo(accessToken, undefined);
      return NO_ACCESS_TOKEN;
    }
  } else {
    logDebug(`Access token valid until ${expirationDate.toLocaleDateString()}`);
  }

  return { accessToken, apiKeySource: undefined };
}
