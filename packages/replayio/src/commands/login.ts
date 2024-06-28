import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { registerCommand } from "../utils/commander/registerCommand";
import { promptForAuthentication } from "../utils/initialization/promptForAuthentication";

registerCommand("login").description("Log into your Replay account (or register)").action(login);

async function login() {
  const { accessToken } = await getAccessToken();
  if (accessToken) {
    console.log("You are already signed in!");
  } else {
    await promptForAuthentication();
  }

  await exitProcess(0);
}
