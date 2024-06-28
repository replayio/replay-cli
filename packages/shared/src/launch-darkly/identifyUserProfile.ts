import { LDContext } from "launchdarkly-node-client-sdk";
import { AuthInfo } from "../graphql/fetchAuthInfoFromGraphQL";
import { logger } from "../logger";
import { getLaunchDarklyClient } from "./getLaunchDarklyClient";

export async function identifyUserProfile(authInfo: AuthInfo) {
  const client = getLaunchDarklyClient();
  try {
    await client.waitForInitialization();

    logger.debug("Identifying LaunchDarkly feature profile for user " + authInfo.id);

    await client.identify({
      anonymous: false,
      key: authInfo.id,
      kind: authInfo.type,
    } satisfies LDContext);
  } catch (error) {
    logger.debug("Failed identify LaunchDarkly feature profiler", { error });
  }
}
