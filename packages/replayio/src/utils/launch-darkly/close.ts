import { raceWithTimeout } from "@replay-cli/shared/async/raceWithTimeout";
import { debug } from "./debug";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

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
