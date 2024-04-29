import { logPromise } from "../async/logPromise.js";
import { raceWithTimeout } from "../async/raceWithTimeout.js";
import { initLaunchDarklyFromAccessToken } from "../launch-darkly/initLaunchDarklyFromAccessToken.js";
import { checkAuthentication } from "./checkAuthentication.js";
import { checkForNpmUpdate } from "./checkForNpmUpdate.js";
import { checkForRuntimeUpdate } from "./checkForRuntimeUpdate.js";
import { promptForAuthentication } from "./promptForAuthentication.js";
import { promptForNpmUpdate } from "./promptForNpmUpdate.js";
import { promptForRuntimeUpdate } from "./promptForRuntimeUpdate.js";

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

  if (npmUpdateCheck.hasUpdate && npmUpdateCheck.shouldShowPrompt) {
    await promptForNpmUpdate(npmUpdateCheck);
  }

  if (runtimeUpdateCheck.hasUpdate && runtimeUpdateCheck.shouldShowPrompt) {
    await promptForRuntimeUpdate(runtimeUpdateCheck);
  }

  await launchDarklyPromise;
}
