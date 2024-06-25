import assert from "node:assert/strict";

let userAgent: string | undefined;

export function setUserAgent(value: string) {
  assert(userAgent === undefined, "User agent already set");
  userAgent = value;
}

export function getUserAgent() {
  assert(userAgent !== undefined, "User agent was not set");
  return userAgent;
}
