import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { logoutIfAuthenticated } from "@replay-cli/shared/authentication/logoutIfAuthenticated";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { highlight } from "@replay-cli/shared/theme";
import { registerCommand } from "../utils/commander/registerCommand";

registerCommand("logout").description("Log out of your Replay account").action(logout);

async function logout() {
  await logoutIfAuthenticated();

  const token = await getAccessToken();
  if (token) {
    const name = process.env.REPLAY_API_KEY ? "REPLAY_API_KEY" : "RECORD_REPLAY_API_KEY";

    console.log(
      `You are now signed out but still authenticated via the ${highlight(name)} env variable`
    );
  } else {
    console.log("You are now signed out");
  }

  await exitProcess(0);
}
