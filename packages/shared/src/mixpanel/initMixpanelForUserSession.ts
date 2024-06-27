import { getAuthInfo } from "../graphql/getAuthInfo";
import { logger } from "../logger";
import { getMixpanelAPI } from "./getMixpanelAPI";
import { configureSession } from "./session";

export async function initMixpanelForUserSession(
  accessToken: string | undefined,
  packageMetadata: {
    packageName: string;
    packageVersion: string;
  }
) {
  let id: string | undefined = undefined;

  const mixpanelAPI = getMixpanelAPI();
  if (mixpanelAPI) {
    logger.debug("Initializing Mixpanel user id");

    if (accessToken) {
      try {
        const authInfo = await getAuthInfo(accessToken);

        logger.debug(`Found cached ${authInfo.type} id ${authInfo.id}`);

        id = authInfo.id;
      } catch (error) {}
    }
  }

  configureSession(id, packageMetadata);
}
