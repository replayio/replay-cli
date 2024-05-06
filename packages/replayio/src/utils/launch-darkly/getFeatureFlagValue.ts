import { debug } from "./debug";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function getFeatureFlagValue<Type>(flag: string, defaultValue: boolean) {
  const client = getLaunchDarklyClient();
  try {
    await client.waitForInitialization();
  } catch (error) {
    debug("Failed to wait for LaunchDarkly initialization %j", error);

    return defaultValue;
  }

  const value = await client.variation(flag, defaultValue);

  return value as Type;
}
