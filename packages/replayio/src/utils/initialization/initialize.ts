import { raceWithTimeout } from "@replay-cli/shared/async/raceWithTimeout";
import { logPromise } from "../async/logPromise";
import { initLaunchDarklyFromAccessToken } from "../launch-darkly/initLaunchDarklyFromAccessToken";
import { initMixpanelForUserSession } from "../mixpanel/initMixpanelForUserSession";
import { checkAuthentication } from "./checkAuthentication";
import { checkForNpmUpdate } from "./checkForNpmUpdate";
import { checkForRuntimeUpdate } from "./checkForRuntimeUpdate";
import { promptForAuthentication } from "./promptForAuthentication";
import { promptForNpmUpdate } from "./promptForNpmUpdate";
import { promptForRuntimeUpdate } from "./promptForRuntimeUpdate";

export async function initialize({
  checkForNpmUpdate: shouldCheckForNpmUpdate,
  checkForRuntimeUpdate: shouldCheckForRuntimeUpdate,
  requireAuthentication,
}: {
  checkForNpmUpdate: boolean;
  checkForRuntimeUpdate: boolean;
  requireAuthentication: boolean;
}) {
  // These initialization steps can run in parallel to improve startup time
  // None of them should log anything though; that would interfere with the initialization-in-progress message
  const promises = Promise.all([
    checkAuthentication(),
    shouldCheckForRuntimeUpdate
      ? raceWithTimeout(checkForRuntimeUpdate(), 5_000)
      : Promise.resolve(),
    shouldCheckForNpmUpdate ? raceWithTimeout(checkForNpmUpdate(), 5_000) : Promise.resolve(),
  ]);

  logPromise(promises, {
    delayBeforeLoggingMs: 250,
    messages: {
      pending: "Initializing…",
    },
  });

  let [
    accessToken,
    runtimeUpdateCheck = { hasUpdate: undefined },
    npmUpdateCheck = { hasUpdate: undefined },
  ] = await promises;

  if (requireAuthentication && !accessToken) {
    accessToken = await promptForAuthentication();
  }

  // Initialize LaunchDarkly and Mixpanel for authenticated users
  // These tasks don't print anything so they can be done in parallel with the upgrade prompts
  // They also shouldn't block on failure, so we should only wait a couple of seconds before giving up
  const abortController = new AbortController();

  const launchDarklyPromise = accessToken
    ? raceWithTimeout(
        initLaunchDarklyFromAccessToken(accessToken, abortController.signal),
        2_500,
        abortController
      )
    : Promise.resolve();

  const mixpanelPromise = raceWithTimeout(
    initMixpanelForUserSession(accessToken),
    2_500,
    abortController
  );

  if (npmUpdateCheck.hasUpdate && npmUpdateCheck.shouldShowPrompt) {
    await promptForNpmUpdate(npmUpdateCheck);
  }

  if (runtimeUpdateCheck.hasUpdate && runtimeUpdateCheck.shouldShowPrompt) {
    await promptForRuntimeUpdate(runtimeUpdateCheck);
  }

  await Promise.all([launchDarklyPromise, mixpanelPromise]);
}
