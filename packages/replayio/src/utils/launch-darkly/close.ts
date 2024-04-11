import { raceWithTimeout } from "../async/raceWithTimeout";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function close() {
  const client = getLaunchDarklyClient(false);
  if (client) {
    await raceWithTimeout(client.close(), 5_000);
  }
}
