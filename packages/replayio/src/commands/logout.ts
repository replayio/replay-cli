import { getAccessToken } from "../utils/authentication/getAccessToken";
import { logoutIfAuthenticated } from "../utils/authentication/logoutIfAuthenticated";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";

registerCommand("logout").description("Sign out of your Replay account").action(logout);

async function logout() {
  await logoutIfAuthenticated();

  const token = await getAccessToken();
  if (token) {
    console.log("Cannot sign out sessions authenticated with an API_KEY");
  } else {
    console.log("You are now signed out");
  }

  await exitProcess(0);
}
