import { program } from "commander";
import { initialize } from "../initialization/initialize";

export function registerCommand(
  commandName: string,
  config: {
    checkForRuntimeUpdate?: boolean;
    requireAuthentication?: boolean;
  } = {}
) {
  const { checkForRuntimeUpdate = false, requireAuthentication = false } = config;

  return program.command(commandName).hook("preAction", async () => {
    await initialize({ checkForRuntimeUpdate, requireAuthentication });
  });
}
