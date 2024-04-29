import { LDContext } from "launchdarkly-node-client-sdk";
import { debug } from "./debug.js";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient.js";

export async function identifyUserProfile(id: string) {
  const client = getLaunchDarklyClient();
  try {
    await client.waitForInitialization();

    debug("Identifying LaunchDarkly feature profile for user %s", id);

    await client.identify({
      kind: "user",
      key: id,
      anonymous: false,
    } satisfies LDContext);
  } catch (error) {
    debug("Failed identify LaunchDarkly feature profiler %j", error);
  }
}
