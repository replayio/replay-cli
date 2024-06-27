import { readFromCache, writeToCache } from "../cache";
import { updateCachedAuthInfo } from "../graphql/updateCachedAuthInfo";
import { logger } from "../logger";
import { maskString } from "../maskString";
import { cachedAuthPath } from "./config";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";
import { CachedAuthDetails } from "./types";

export async function getAccessToken(): Promise<string | undefined> {
  if (process.env.REPLAY_API_KEY) {
    logger.debug("Using token from env (REPLAY_API_KEY)");
    return process.env.REPLAY_API_KEY;
  } else if (process.env.RECORD_REPLAY_API_KEY) {
    logger.debug("Using token from env (RECORD_REPLAY_API_KEY)");
    return process.env.RECORD_REPLAY_API_KEY;
  }

  let { accessToken, refreshToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (typeof accessToken !== "string") {
    logger.debug("Unexpected accessToken value", { accessToken });
    return;
  }
  if (typeof refreshToken !== "string") {
    logger.debug("Unexpected refreshToken", { refreshToken });
    return;
  }

  const [_, encodedToken, __] = accessToken.split(".", 3);
  if (typeof encodedToken !== "string") {
    logger.debug("Token did not contain a valid payload", { accessToken: maskString(accessToken) });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(encodedToken, "base64").toString());
  } catch (error) {
    logger.debug("Failed to decode token", { accessToken: maskString(accessToken), error });
    return;
  }

  if (typeof payload !== "object") {
    logger.debug("Token payload was not an object");
    return;
  }

  const expiration = (payload?.exp ?? 0) * 1000;
  const expirationDate = new Date(expiration);
  const hasTokenExpired = expiration - Date.now() <= 0;
  if (hasTokenExpired) {
    logger.debug(`Access token expired at ${expirationDate.toLocaleDateString()}`);

    try {
      const refreshedTokens = await refreshAccessTokenOrThrow(refreshToken);
      writeToCache(cachedAuthPath, refreshedTokens);
      accessToken = refreshedTokens.accessToken;
    } catch (error) {
      writeToCache(cachedAuthPath, undefined);
      updateCachedAuthInfo(accessToken, undefined);
      return;
    }
  } else {
    logger.debug(`Access token valid until ${expirationDate.toLocaleDateString()}`);
  }

  return accessToken;
}
