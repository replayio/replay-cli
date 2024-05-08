import { getUserIdOrThrow } from "../graphql/getUserIdOrThrow";
import { debug } from "./debug";
import { identifyUserProfile } from "./identifyUserProfile";

export async function initLaunchDarklyFromAccessToken(
  accessToken: string,
  abortSignal: AbortSignal
) {
  debug("Initializing LaunchDarkly profile");

  try {
    const id = await getUserIdOrThrow(accessToken);

    if (abortSignal.aborted) {
      return;
    }

    debug("Found cached user id %s", id);

    if (id) {
      await identifyUserProfile(id);
    }
  } catch (error) {
    debug("Failed to initialize LaunchDarkly profile: %o", error);
  }
}
