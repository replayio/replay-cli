import { program } from "commander";
import { initialize } from "../initialization/initialize";
import { trackEvent } from "../mixpanel/trackEvent";

export function registerCommand(
  commandName: string,
  config: {
    checkForNpmUpdate?: boolean;
    checkForRuntimeUpdate?: boolean;
    requireAuthentication?: boolean;
  } = {}
) {
  const {
    checkForNpmUpdate = true,
    checkForRuntimeUpdate = false,
    requireAuthentication = false,
  } = config;

  return program.command(commandName).hook("preAction", async () => {
    trackEvent("command", { commandName });

    await initialize({
      checkForNpmUpdate,
      checkForRuntimeUpdate,
      requireAuthentication,
    });
  });
}
