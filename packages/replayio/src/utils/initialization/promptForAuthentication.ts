import { raceWithTimeout } from "@replay-cli/shared/async/raceWithTimeout";
import { authenticateByBrowser } from "@replay-cli/shared/authentication/authenticateByBrowser";
import { logError } from "@replay-cli/shared/logger";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { highlight } from "@replay-cli/shared/theme";

const TIMEOUT = 60_000;

export async function promptForAuthentication() {
  const accessToken = await raceWithTimeout(authenticateByBrowser(), TIMEOUT);
  if (!accessToken) {
    logError("Authentication timed out");

    console.log("");
    console.log(highlight("Log in timed out; please try again"));

    await exitProcess(1);
  }

  return accessToken;
}
