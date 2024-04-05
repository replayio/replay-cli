import { getAccessToken } from "../utils/authentication/getAccessToken";
import { requireAuthentication } from "../utils/authentication/requireAuthentication";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";

registerCommand("login")
  .description("Sign in to your Replay account with your browser")
  .action(login);

async function login() {
  let savedAccessToken = await getAccessToken();
  if (savedAccessToken) {
    console.log("You are already signed in!");
  } else {
    requireAuthentication();
  }

  await exitProcess(0);
}
