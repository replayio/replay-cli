import { mixpanelAPI } from "@replay-cli/shared/mixpanel/mixpanelAPI";
import { program } from "commander";
import { initialize } from "../initialization/initialize";

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
    mixpanelAPI.trackEvent("command", { commandName });

    await initialize({
      checkForNpmUpdate,
      checkForRuntimeUpdate,
      requireAuthentication,
    });
  });
}
