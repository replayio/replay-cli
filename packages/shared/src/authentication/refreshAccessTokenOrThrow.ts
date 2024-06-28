import { fetch } from "undici";
import { logger } from "../logger";
import { AuthenticationError } from "./AuthenticationError";
import { authClientId, authHost } from "./config";

export async function refreshAccessTokenOrThrow(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const resp = await fetch(`https://${authHost}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: "https://api.replay.io",
      scope: "openid profile",
      grant_type: "refresh_token",
      client_id: authClientId,
      refresh_token: refreshToken,
    }),
  });

  const json: any = await resp.json();

  if (json.error) {
    logger.debug("OAuth token request failed", json);

    throw new AuthenticationError("auth0-error", json.error);
  }

  if (!json.access_token || !json.refresh_token) {
    logger.debug("OAuth token request was missing access or refresh token", json);

    throw new AuthenticationError(
      "no-access-or-refresh-token",
      "No access or refresh token in response"
    );
  }

  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
  };
}
