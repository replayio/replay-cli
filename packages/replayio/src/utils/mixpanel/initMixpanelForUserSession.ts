import { getUserIdOrThrow } from "../graphql/getUserIdOrThrow";
import { debug } from "./debug";
import { configureSession } from "./session";
import { getMixpanelAPI } from "./getMixpanelAPI";

export async function initMixpanelForUserSession(accessToken: string | undefined) {
  const mixpanelAPI = getMixpanelAPI();
  if (!mixpanelAPI) {
    return;
  }

  debug("Initializing Mixpanel user id");

  let id: string | undefined = undefined;

  if (accessToken) {
    try {
      id = await getUserIdOrThrow(accessToken);

      debug("Found cached user id %s", id);
    } catch (error) {}
  }

  configureSession(id);
}
