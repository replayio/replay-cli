import fetch from "node-fetch";
import { AuthenticationError } from "./AuthenticationError";
import { authClientId, authHost } from "./config";
import { debug } from "./debug";

export async function refreshAccessTokenOrThrow(refreshToken: string): Promise<string> {
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
    debug("OAuth token request failed: %O", json.error);

    throw new AuthenticationError("auth0-error", json.error);
  }

  if (!json.access_token) {
    debug("OAuth token request was missing access token: %O", json);

    throw new AuthenticationError("no-access-token", "No access token in response");
  }

  return json.access_token as string;
}
