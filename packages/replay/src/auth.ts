import { spawn } from "child_process";
import { createHash } from "crypto";
import dbg from "./debug";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

import { query } from "./graphql";
import { getDirectory, maybeLog, openExecutable } from "./utils";
import { Options } from "./types";
import { launchDarkly } from "./launchdarkly";

const debug = dbg("replay:cli:auth");

function isInternalError(e: unknown): e is { id: string } {
  if (typeof e === "object" && e && "id" in e) {
    return typeof (e as any).id === "string";
  }

  return false;
}

function getAuthHost() {
  return process.env.REPLAY_AUTH_HOST || "webreplay.us.auth0.com";
}

function getAuthClientId() {
  return process.env.REPLAY_AUTH_CLIENT_ID || "4FvFnJJW4XlnUyrXQF8zOLw6vNAH1MAo";
}

function tokenInfo(token: string) {
  const [_header, encPayload, _cypher] = token.split(".", 3);
  if (typeof encPayload !== "string") {
    debug("Token did not contain a valid payload: %s", maskToken(token));
    return null;
  }

  let payload;
  try {
    const decPayload = Buffer.alloc(encPayload.length, encPayload, "base64");
    payload = JSON.parse(new TextDecoder().decode(decPayload));
  } catch (err) {
    debug("Failed to decode token: %s %e", maskToken(token), err);
    return null;
  }

  if (typeof payload !== "object") {
    debug("Token payload was not an object");
    return null;
  }

  return { payload };
}

function hasTokenExpired(token: string) {
  const userInfo = tokenInfo(token);
  const exp: number | undefined = userInfo?.payload?.exp;
  debug("token expiration time: %d", exp ? exp * 1000 : 0);

  return exp != null && Date.now() - exp * 1000 > 0;
}

function maskToken(token: string) {
  return token.replace(/.(?!.{0,2}$)/g, "*");
}

async function refresh(refreshToken: string) {
  try {
    const resp = await fetch(`https://${getAuthHost()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience: "https://api.replay.io",
        scope: "openid profile",
        grant_type: "refresh_token",
        client_id: getAuthClientId(),
        refresh_token: refreshToken,
      }),
    });

    const json: any = await resp.json();

    if (json.error) {
      debug("OAuth token request failed: %O", json.error);

      throw {
        id: "auth0-error",
        message: json.error,
      };
    }

    if (!json.access_token) {
      debug("OAuth token request was missing access token: %O", json);

      throw {
        id: "no-access-token",
      };
    }

    return json.access_token;
  } catch (e: any) {
    throw {
      ...e,
      refreshToken: maskToken(refreshToken),
    };
  }
}

function generateAuthKey() {
  const hash = createHash("sha256");
  hash.write(String(globalThis.performance.now()));
  return hash.digest("hex").toString();
}

function initAuthRequest(options: Options = {}) {
  maybeLog(options.verbose, "🌎 Launching browser to login to replay.io");
  const key = generateAuthKey();
  const server = process.env.REPLAY_APP_SERVER || "https://app.replay.io";
  spawn(openExecutable(), [`${server}/api/browser/auth?key=${key}&source=cli`]);

  return key;
}

async function fetchToken(key: string) {
  const resp = await query(
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

  if (resp.errors) {
    if (
      resp.errors.length === 1 &&
      resp.errors[0].message === "Authentication request does not exist"
    ) {
      throw {
        id: "missing-request",
      };
    } else {
      throw {
        id: "close-graphql-error",
        message: resp.errors
          .map((e: any) => e.message)
          .filter(Boolean)
          .join(", "),
      };
    }
  } else if (!resp.data.closeAuthRequest.token) {
    // there's no obvious reason this would occur but for completeness ...
    throw {
      id: "close-missing-token",
      message: JSON.stringify(resp),
    };
  }

  const refreshToken = resp.data.closeAuthRequest.token;

  return refreshToken;
}

export async function pollForToken(key: string, options: Options = {}) {
  let timedOut = false;
  setTimeout(() => {
    timedOut = true;
  }, 60 * 1000);

  while (true) {
    if (timedOut) {
      debug("Timed out waiting for auth request");
      throw { id: "timeout" };
    }

    try {
      const refreshToken = await fetchToken(key);
      maybeLog(options.verbose, "🔑 Fetching token");

      return await refresh(refreshToken);
    } catch (e: any) {
      if (e.id === "missing-request") {
        debug("Auth request was not found. Retrying.");
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        throw e;
      }
    }
  }
}

function getTokenPath(options: Options = {}) {
  const directory = getDirectory(options);
  return path.resolve(path.join(directory, "profile", "auth.json"));
}

export async function readToken(options: Options = {}) {
  try {
    const tokenPath = getTokenPath(options);
    const tokenJson = await readFile(tokenPath, { encoding: "utf-8" });
    const { token } = JSON.parse(tokenJson);

    if (hasTokenExpired(token)) {
      await writeFile(tokenPath, "{}");
      return;
    }

    if (typeof token !== "string") {
      throw new Error("Unexpect token value: " + token);
    }

    return token;
  } catch (e) {
    debug("Failed to read/write token file: %o", e);
    return;
  }
}

async function writeToken(token: string, options: Options = {}) {
  maybeLog(options.verbose, "✍️ Saving token");
  const tokenPath = getTokenPath(options);
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(
    tokenPath,
    JSON.stringify(
      {
        "// Docs": "This contains your app.replay.io authentication token. Do not share!",
        token,
      },
      undefined,
      2
    ),
    { encoding: "utf-8" }
  );
}

export async function maybeAuthenticateUser(options: Options = {}) {
  try {
    const key = initAuthRequest(options);
    const token = await pollForToken(key, options);
    await writeToken(token);

    maybeLog(options.verbose, "✅ Authentication complete!");

    return true;
  } catch (e) {
    debug("Failed to authenticate user: %o", e);

    if (isInternalError(e)) {
      if (e.id === "timeout") {
        console.error("Timed out waiting for browser authentication. Please try again.");
      } else {
        console.error("Failed to authenticate (reason: %s)", e.id);
      }
    } else {
      console.error("Failed to authenticate");
    }

    return false;
  }
}

function parseId(id: string) {
  return Buffer.from(id, "base64").toString("utf-8").split(":")[1];
}

async function getAuthInfo(key: string) {
  const resp = await query(
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
    undefined,
    key
  );

  if (resp.errors) {
    throw {
      id: "graphql-error",
      message: resp.errors
        .map((e: any) => e.message)
        .filter(Boolean)
        .join(", "),
    };
  }

  const response = resp.data as {
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

  const encodedUserId = response?.viewer?.user?.id;
  const encodedWorkspaceId = response?.auth?.workspaces?.edges?.[0]?.node?.id;

  return {
    userId: encodedUserId ? parseId(encodedUserId) : null,
    workspaceId: encodedWorkspaceId ? parseId(encodedWorkspaceId) : null,
  };
}

function getAuthInfoCachePath(options: Options = {}) {
  const directory = getDirectory(options);
  return path.resolve(path.join(directory, "profile", "authInfo.json"));
}

function authInfoCacheKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

async function writeAuthInfoCache(
  key: string,
  authInfo: { userId: string | null; workspaceId: string | null },
  options: Options = {}
) {
  const cachePath = getAuthInfoCachePath(options);
  await mkdir(path.dirname(getAuthInfoCachePath(options)), { recursive: true });
  const cache = {
    [authInfoCacheKey(key)]: authInfo,
  };
  await writeFile(cachePath, JSON.stringify(cache, undefined, 2), { encoding: "utf-8" });
}

async function readAuthInfoCache(key: string, options: Options = {}) {
  try {
    const cachePath = getAuthInfoCachePath(options);
    const cacheJson = await readFile(cachePath, { encoding: "utf-8" });
    const cache = JSON.parse(cacheJson);
    return cache[authInfoCacheKey(key)];
  } catch (e) {
    debug("Failed to read auth info cache: %o", e);
    return;
  }
}

export async function initLDContextFromKey(options: Options = {}) {
  const apiKey = options.apiKey ?? (await readToken(options));
  if (!apiKey) {
    return;
  }

  let authInfo = await readAuthInfoCache(apiKey, options);
  if (!authInfo) {
    debug("Fetching auth info from server");
    authInfo = await getAuthInfo(apiKey);
    if (authInfo) {
      await writeAuthInfoCache(apiKey, authInfo, options);
    }
  }

  if (!authInfo) {
    return;
  }

  if (authInfo.userId) {
    await launchDarkly.identify({ type: "user", id: authInfo.userId });
  } else if (authInfo.workspaceId) {
    await launchDarkly.identify({ type: "workspace", id: authInfo.workspaceId });
  }
}
