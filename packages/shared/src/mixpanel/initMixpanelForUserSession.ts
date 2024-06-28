import { getAuthInfo } from "../graphql/getAuthInfo";
import { logger } from "../logger";
import { getMixpanelAPI } from "./getMixpanelAPI";
import { configureSession } from "./session";
import { DefaultProperties } from "./types";

export async function initMixpanelForUserSession(
  accessToken: string | undefined,
  defaultProperties: DefaultProperties
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

  configureSession(id, defaultProperties);
}
