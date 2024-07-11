import {
  LDClient,
  LDSingleKindContext,
  initialize as initializeLDClient,
} from "launchdarkly-node-client-sdk";
import { getReplayPath } from "../getReplayPath";

let client: LDClient;

export function getLaunchDarklyClient(): LDClient;
export function getLaunchDarklyClient(initialize: true): LDClient;
export function getLaunchDarklyClient(initialize: false): LDClient | undefined;

export function getLaunchDarklyClient(initialize: boolean = true) {
  if (client) {
    return client;
  } else if (initialize) {
    client = initializeLDClient(
      "60ca05fb43d6f10d234bb3cf",
      {
        kind: "user",
        anonymous: true,
      } satisfies LDSingleKindContext,
      {
        localStoragePath: getReplayPath("launchdarkly-user-cache"),
        logger: {
          debug() {},
          error() {},
          info() {},
          warn() {},
        },
      }
    );

    return client;
  }
}
