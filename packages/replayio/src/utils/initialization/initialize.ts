import { raceWithTimeout } from "@replay-cli/shared/async/raceWithTimeout";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { initializeAuthInfo } from "@replay-cli/shared/session/initializeAuthInfo";
import { initializePackageInfo } from "@replay-cli/shared/session/initializePackageInfo";
import { name as packageName, version as packageVersion } from "../../../package.json";
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
  // Initialize package info before checking authentication status
  // If authentication times out, package info will still be required to flush pending task queue items
  initializePackageInfo({
    packageName,
    packageVersion,
  });

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

  // Initialize auth info only after successful authentication
  initializeAuthInfo({
    accessToken,
  });

  if (npmUpdateCheck.hasUpdate && npmUpdateCheck.shouldShowPrompt) {
    await promptForNpmUpdate(npmUpdateCheck);
  }

  if (runtimeUpdateCheck.hasUpdate && runtimeUpdateCheck.shouldShowPrompt) {
    await promptForRuntimeUpdate(runtimeUpdateCheck);
  }
}
