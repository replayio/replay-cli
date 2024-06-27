import { raceWithTimeout } from "../async/raceWithTimeout";
import { logger } from "../logger";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function close() {
  const client = getLaunchDarklyClient(false);
  if (client) {
    try {
      await raceWithTimeout(client.close(), 5_000);
    } catch (error) {
      logger.debug("Failed to close LaunchDarkly client", { error });
    }
  }
}
