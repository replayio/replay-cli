import { logPromise } from "../async/logPromise";
import { raceWithTimeout } from "../async/raceWithTimeout";
import { initLaunchDarklyFromAccessToken } from "../launch-darkly/initLaunchDarklyFromAccessToken";
import { checkAuthentication } from "./checkAuthentication";
import { checkForNpmUpdate } from "./checkForNpmUpdate";
import { checkForRuntimeUpdate } from "./checkForRuntimeUpdate";
import { promptForAuthentication } from "./promptForAuthentication";
import { promptForNpmUpdate } from "./promptForNpmUpdate";
import { promptForRuntimeUpdate } from "./promptForRuntimeUpdate";

export async function initialize({
  checkForRuntimeUpdate: shouldCheckForRuntimeUpdate,
  requireAuthentication,
}: {
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
    raceWithTimeout(checkForNpmUpdate(), 5_000),
  ]);

  logPromise({
    delayBeforeLoggingMs: 250,
    messages: {
      pending: "Initializing…",
    },
    promise: promises,
  });

  let [
    accessToken,
    runtimeUpdateCheck = { hasUpdate: undefined },
    npmUpdateCheck = { hasUpdate: undefined },
  ] = await promises;

  if (requireAuthentication && !accessToken) {
    accessToken = await promptForAuthentication();
  }

  // Initialize LaunchDarkly for the authenticated user
  // This doesn't log anything so it can be done in parallel with the upgrade prompts
  // This isn't hugely important though so we should only give it a couple of seconds before giving up
  const launchDarklyAbortController = new AbortController();
  const launchDarklyPromise = accessToken
    ? raceWithTimeout(
        initLaunchDarklyFromAccessToken(accessToken, launchDarklyAbortController.signal),
        2_500,
        launchDarklyAbortController
      )
    : Promise.resolve();

  if (npmUpdateCheck.hasUpdate) {
    await promptForNpmUpdate(npmUpdateCheck);
  }

  if (
    shouldCheckForRuntimeUpdate &&
    runtimeUpdateCheck.hasUpdate &&
    runtimeUpdateCheck.shouldShowPrompt
  ) {
    await promptForRuntimeUpdate(runtimeUpdateCheck);
  }

  await launchDarklyPromise;
}
