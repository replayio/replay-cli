import { raceWithTimeout } from "../async/raceWithTimeout.js";
import { debug } from "./debug.js";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient.js";

export async function close() {
  const client = getLaunchDarklyClient(false);
  if (client) {
    try {
      await raceWithTimeout(client.close(), 5_000);
    } catch (error) {
      debug("Failed to close LaunchDarkly client %j", error);
    }
  }
}
