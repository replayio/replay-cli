import { logger } from "../logger";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function getFeatureFlagValue<Type>(flag: string, defaultValue: boolean) {
  const client = getLaunchDarklyClient();
  try {
    await client.waitForInitialization();
  } catch (error) {
    logger.debug("Failed to wait for LaunchDarkly initialization", { error });

    return defaultValue;
  }

  const value = await client.variation(flag, defaultValue);

  return value as Type;
}
