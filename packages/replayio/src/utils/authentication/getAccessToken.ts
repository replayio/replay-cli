import { readFromCache, writeToCache } from "../cache";
import { updateLaunchDarklyCache } from "../launch-darkly/updateLaunchDarklyCache";
import { maskString } from "../maskString";
import { cachedAuthPath } from "./config";
import { debug } from "./debug";
import { refreshAccessTokenOrThrow } from "./refreshAccessTokenOrThrow";
import { CachedAuthDetails } from "./types";

export async function getAccessToken(): Promise<string | undefined> {
  if (process.env.REPLAY_API_KEY) {
    debug("Using token from env (REPLAY_API_KEY)");
    return process.env.REPLAY_API_KEY;
  } else if (process.env.RECORD_REPLAY_API_KEY) {
    debug("Using token from env (RECORD_REPLAY_API_KEY)");
    return process.env.RECORD_REPLAY_API_KEY;
  }

  let { accessToken, refreshToken } = readFromCache<CachedAuthDetails>(cachedAuthPath) ?? {};
  if (typeof accessToken !== "string") {
    debug("Unexpected accessToken value: " + accessToken);
    return;
  }
  if (typeof refreshToken !== "string") {
    debug("Unexpected refreshToken: " + refreshToken);
    return;
  }

  const [_, encodedToken, __] = accessToken.split(".", 3);
  if (typeof encodedToken !== "string") {
    debug("Token did not contain a valid payload: %s", maskString(accessToken));
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(encodedToken, "base64").toString());
  } catch (error) {
    debug("Failed to decode token: %s %e", maskString(accessToken), error);
    return;
  }

  if (typeof payload !== "object") {
    debug("Token payload was not an object");
    return;
  }

  const expiration = (payload?.exp ?? 0) * 1000;
  const expirationDate = new Date(expiration);
  const hasTokenExpired = expiration - Date.now() <= 0;
  if (hasTokenExpired) {
    debug(
      "Access token expired at",
      expirationDate.toLocaleDateString(),
      expirationDate.toLocaleTimeString()
    );

    try {
      accessToken = await refreshAccessTokenOrThrow(refreshToken);
    } catch (error) {
      writeToCache(cachedAuthPath, undefined);
      updateLaunchDarklyCache(accessToken, undefined);
      return;
    }
  } else {
    debug(
      "Access token valid until",
      expirationDate.toLocaleDateString(),
      expirationDate.toLocaleTimeString()
    );
  }

  return accessToken;
}
