import chalk from "chalk";
import { getAccessToken } from "../utils/authentication/getAccessToken";
import { logoutIfAuthenticated } from "../utils/authentication/logoutIfAuthenticated";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";

registerCommand("logout").description("Sign out of your Replay account").action(logout);

async function logout() {
  await logoutIfAuthenticated();

  const token = await getAccessToken();
  if (token) {
    const name = process.env.REPLAY_API_KEY ? "REPLAY_API_KEY" : "RECORD_REPLAY_API_KEY";

    console.log(
      `You are now signed out but still authenticated via the ${chalk.yellowBright(
        name
      )} env variable`
    );
  } else {
    console.log("You are now signed out");
  }

  await exitProcess(0);
}
