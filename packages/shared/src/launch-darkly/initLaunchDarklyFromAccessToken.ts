import { getAuthInfo } from "../graphql/getAuthInfo";
import { logger } from "../logger";
import { identifyUserProfile } from "./identifyUserProfile";

export async function initLaunchDarklyFromAccessToken(
  accessToken: string,
  abortSignal: AbortSignal
) {
  logger.debug("Initializing LaunchDarkly profile");

  try {
    const authInfo = await getAuthInfo(accessToken);

    if (abortSignal.aborted) {
      return;
    }

    logger.debug(`Found cached ${authInfo.type} id ${authInfo.id}`);

    await identifyUserProfile(authInfo);
  } catch (error) {
    logger.debug("Failed to initialize LaunchDarkly profil", { error });
  }
}
