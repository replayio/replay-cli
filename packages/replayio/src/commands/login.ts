import { checkAuthentication } from "../utils/initialization/checkAuthentication.js";
import { promptForAuthentication } from "../utils/initialization/promptForAuthentication.js";
import { registerCommand } from "../utils/commander/registerCommand.js";
import { exitProcess } from "../utils/exitProcess.js";

registerCommand("login").description("Log into your Replay account (or register)").action(login);

async function login() {
  const authenticated = await checkAuthentication();
  if (authenticated) {
    console.log("You are already signed in!");
  } else {
    await promptForAuthentication();
  }

  await exitProcess(0);
}
