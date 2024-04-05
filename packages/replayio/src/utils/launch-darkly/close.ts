import { debug } from "./debug";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function close() {
  const client = getLaunchDarklyClient(false);
  if (client) {
    try {
      await client.close();
    } catch (error) {
      debug("Failed to close LaunchDarkly client %j", error);
    }
  }
}
