import dbg from "debug";
import path from "path";

import { CommandLineOptions } from "./types";
import fetch from "node-fetch";

const debug = dbg("replay:cli");

function defer<T = unknown>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: any) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function maybeLog(verbose: boolean | undefined, str: string) {
  debug(str);
  if (verbose) {
    console.log(str);
  }
}

function getDirectory(opts?: Pick<CommandLineOptions, "directory">) {
  const home = process.env.HOME || process.env.USERPROFILE;
  return (
    (opts && opts.directory) || process.env.RECORD_REPLAY_DIRECTORY || path.join(home!, ".replay")
  );
}

function isValidUUID(str: unknown) {
  if (typeof str != "string" || str.length != 36) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    if ("0123456789abcdef-".indexOf(str[i]) == -1) {
      return false;
    }
  }
  return true;
}

async function waitForTime(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Random extra delay under 100ms to avoid retrying in bursts.
function jitter(): number {
  return Math.random() * 100.0;
}

// Returns backoff timeouts (in ms) in a geometric progression, and with jitter.
function backoff(iteration: number): number {
  return 2 ** iteration * 100 + jitter();
}

const MAX_ATTEMPTS = 5;

export async function exponentialBackoffRetry<T>(
  fn: () => T,
  onFail?: (e: unknown) => void
): Promise<T> {
  let currentAttempt = 0;
  while (currentAttempt <= MAX_ATTEMPTS) {
    currentAttempt++;
    try {
      return fn();
    } catch (e) {
      if (onFail) {
        onFail(e);
      }
      if (currentAttempt == MAX_ATTEMPTS) {
        throw e;
      }
      waitForTime(backoff(currentAttempt));
    }
  }
  throw Error("ShouldBeUnreachable");
}

export async function queryGraphQL(
  accessToken: string | null,
  query: string,
  variables: Object = {}
): Promise<any | null> {
  const response = await fetch("https://api.replay.io/v1/graphql", {
    method: "POST",
    headers: {
      ...(accessToken && {
        Authorization: `Bearer ${accessToken}`,
      }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });
  const json = await response.json();
  return json;
}

export async function fetchGraphql(query: string, variables: Object, apiKey: string) {
  const queryRes = await fetch("https://graphql.replay.io/v1/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });
}

export { defer, maybeLog, getDirectory, isValidUUID };
