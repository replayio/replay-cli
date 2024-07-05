// This module is meant to be somewhat browser-friendly.
// It can't lead to importing node builtin modules like like worker_threads.
// Cypress bundles this file and runs it in the browser,
// some imports like path and http are OK because they are aliased~ by their webpack config:
// https://github.com/cypress-io/cypress/blob/fb87950d6337ba99d13cb5fa3ce129e5f5cac02b/npm/webpack-batteries-included-preprocessor/index.js#L151
// TODO: decouple this more so we never run into problems with this - we shouldn't rely on implementation details of Cypress bundling
import { AgentOptions, Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

function defer<T = unknown>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: any) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function maybeLogToConsole(verbose: boolean | undefined, str: string) {
  if (verbose) {
    console.log(str);
  }
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

function getHttpAgent(server: string, agentOptions?: AgentOptions) {
  const serverURL = new URL(server);
  if (!agentOptions) {
    return;
  }

  if (["wss:", "https:"].includes(serverURL.protocol)) {
    return new HttpsAgent(agentOptions);
  } else if (["ws:", "http:"].includes(serverURL.protocol)) {
    return new HttpAgent(agentOptions);
  }

  throw new Error(`Unsupported protocol: ${serverURL.protocol} for URL ${serverURL}`);
}

export { defer, getHttpAgent, isValidUUID, maybeLogToConsole };
