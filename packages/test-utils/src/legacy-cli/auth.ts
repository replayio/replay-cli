import { readFile, writeFile } from "fs/promises";
import path from "path";
import { Options } from "./types";
import { getDirectory } from "./utils";
import { logger } from "@replay-cli/shared/logger";

function parseTokenInfo(token: string) {
  logger.info("ParseTokenInfo:Started");

  const [_header, encPayload, _cypher] = token.split(".", 3);
  if (typeof encPayload !== "string") {
    logger.error("ParseTokenInfo:InvalidPayload", { maskedToken: maskToken(token) });
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encPayload, "base64").toString());
  } catch (error) {
    logger.error("ParseTokenInfo:DecodeFailed", {
      maskedToken: maskToken(token),
      error,
    });
    return null;
  }

  if (typeof payload !== "object") {
    logger.error("ParseTokenInfo:PayloadWasNotObject", {
      maskedToken: maskToken(token),
      payloadType: typeof payload,
    });
    return null;
  }

  return { payload };
}

function hasTokenExpired(token: string) {
  logger.info("HasTokenExpired:Started");

  const userInfo = parseTokenInfo(token);
  const exp: number | undefined = userInfo?.payload?.exp;
  logger.info("HasTokenExpired:GotExpirationTime", { expirationTime: exp ? exp * 1000 : 0 });

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
  logger.info("ReadToken:Started");

  try {
    const tokenPath = getTokenPath(options);
    const tokenJson = await readFile(tokenPath, { encoding: "utf-8" });
    const { token } = JSON.parse(tokenJson);

    if (hasTokenExpired(token)) {
      logger.info("ReadToken:TokenExpired", { tokenPath });
      await writeFile(tokenPath, "{}");
      return;
    }

    if (typeof token !== "string") {
      logger.error("ReadToken:UnexpectedTokenValue", { tokenPath, token });
      throw new Error("Unexpect token value: " + token);
    }

    return token;
  } catch (error) {
    logger.error("ReadToken:Failed", { error });
    return;
  }
}
