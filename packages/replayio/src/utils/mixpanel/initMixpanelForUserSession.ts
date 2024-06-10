import { getUserIdOrThrow } from "../graphql/getUserIdOrThrow";
import { debug } from "./debug";
import { configureSession } from "./session";
import { getMixpanelAPI } from "./getMixpanelAPI";

export async function initMixpanelForUserSession(accessToken: string | undefined) {
  let id: string | undefined = undefined;
  console.log("SENTINEL: initMixpanelForUserSession", accessToken);

  const mixpanelAPI = getMixpanelAPI();
  if (mixpanelAPI) {
    debug("Initializing Mixpanel user id");

    if (accessToken) {
      try {
        id = await getUserIdOrThrow(accessToken);

        debug("Found cached user id %s", id);
      } catch (error) {}
    }
  }

  configureSession(id);
}
