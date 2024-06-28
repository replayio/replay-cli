import { spawn } from "child_process";
import { createHash } from "crypto";
import dbg from "./debug";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

import { queryGraphQL } from "@replay-cli/shared/graphql/queryGraphQL";
import { getDirectory, maybeLog, openExecutable } from "./utils";
import { Options } from "./types";
import { getLaunchDarkly } from "./launchdarkly";

const debug = dbg("replay:cli:auth");

class GraphQLError extends Error {
  constructor(message: string, public errors: any[]) {
    const errorsMessage = errors
      .map((e: any) => e.message)
      .filter(Boolean)
      .join(", ");
    super(`${message}: ${errorsMessage}`);
  }
}

function isInternalError(e: unknown): e is { id: string } {
  return typeof e === "object" && !!e && "id" in e && typeof e.id === "string";
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
    payload = JSON.parse(Buffer.from(encPayload, "base64").toString());
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
  const resp = await queryGraphQL(
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

async function getApiKey(options: Options = {}) {
  return (
    options.apiKey ??
    process.env.REPLAY_API_KEY ??
    process.env.RECORD_REPLAY_API_KEY ??
    (await readToken(options))
  );
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

async function getAuthInfo(key: string): Promise<string> {
  const resp = await queryGraphQL(
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
    throw new GraphQLError("Failed to fetch auth info", resp.errors);
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

  const { viewer, auth } = response;

  if (viewer?.user?.id) {
    return viewer.user.id;
  }

  if (auth?.workspaces?.edges?.[0]?.node?.id) {
    return auth.workspaces.edges[0].node.id;
  }

  throw new Error("Unrecognized type of an API key: Missing both user ID and workspace ID.");
}

function getAuthInfoCachePath(options: Options = {}) {
  const directory = getDirectory(options);
  return path.resolve(path.join(directory, "profile", "authInfo.json"));
}

// We don't want to store the API key in plain text, especially when provided
// via env or CLI arg. Hashing it would prevent leaking the key
function authInfoCacheKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

async function writeAuthInfoCache(
  key: string,
  authInfo: string,
  options: Options = {}
): Promise<{
  [key: string]: string;
}> {
  const cachePath = getAuthInfoCachePath(options);
  await mkdir(path.dirname(getAuthInfoCachePath(options)), { recursive: true });
  const cache = {
    [authInfoCacheKey(key)]: authInfo,
  };
  await writeFile(cachePath, JSON.stringify(cache, undefined, 2), { encoding: "utf-8" });
  return cache;
}

async function readAuthInfoCache(key: string, options: Options = {}): Promise<string | undefined> {
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

export async function initLDContextFromApiKey(options: Options = {}) {
  const apiKey = await getApiKey(options);
  if (!apiKey) {
    return;
  }

  let targetId: string | undefined = await readAuthInfoCache(apiKey, options);
  if (!targetId) {
    debug("Fetching auth info from server");
    targetId = await getAuthInfo(apiKey);
    await writeAuthInfoCache(apiKey, targetId, options);
  }

  await getLaunchDarkly().initialize().identify({ type: "user", id: targetId });
}
