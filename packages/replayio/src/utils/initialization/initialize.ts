import { raceWithTimeout } from "@replay-cli/shared/async/raceWithTimeout";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { logPromise } from "../async/logPromise";
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
    getAccessToken().then(({ accessToken }) => accessToken),
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

  if (npmUpdateCheck.hasUpdate && npmUpdateCheck.shouldShowPrompt) {
    await promptForNpmUpdate(npmUpdateCheck);
  }

  if (runtimeUpdateCheck.hasUpdate && runtimeUpdateCheck.shouldShowPrompt) {
    await promptForRuntimeUpdate(runtimeUpdateCheck);
  }
}
