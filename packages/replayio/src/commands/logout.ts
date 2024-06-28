import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { logoutIfAuthenticated } from "@replay-cli/shared/authentication/logoutIfAuthenticated";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { highlight } from "@replay-cli/shared/theme";
import { registerCommand } from "../utils/commander/registerCommand";

registerCommand("logout").description("Log out of your Replay account").action(logout);

async function logout() {
  await logoutIfAuthenticated();

  const { accessToken, apiKeySource } = await getAccessToken();
  if (accessToken && apiKeySource) {
    console.log(
      `You have been signed out but you are still authenticated by the ${highlight(
        apiKeySource
      )} env variable`
    );
  } else {
    console.log("You are now signed out");
  }

  await exitProcess(0);
}
