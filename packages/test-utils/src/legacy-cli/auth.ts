import { readFile, writeFile } from "fs/promises";
import path from "path";
import dbg from "./debug";

import { Options } from "./types";
import { getDirectory } from "./utils";

const debug = dbg("replay:cli:auth");

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
