import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { getAuthInfo } from "@replay-cli/shared/graphql/getAuthInfo";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { dim, emphasize, highlight, link } from "@replay-cli/shared/theme";
import { name as packageName } from "../../package.json";
import { registerCommand } from "../utils/commander/registerCommand";
import { fetchViewerFromGraphQL } from "../utils/graphql/fetchViewerFromGraphQL";

registerCommand("whoami", {
  checkForNpmUpdate: false,
  checkForRuntimeUpdate: false,
  requireAuthentication: false,
})
  .description("Display info about the current user")
  .action(info);

const DOCS_URL = "https://docs.replay.io/reference/api-keys";

async function info() {
  const { accessToken, apiKeySource } = await getAccessToken();
  if (accessToken) {
    const authInfo = await getAuthInfo(accessToken);

    const { userEmail, userName, teamName } = await fetchViewerFromGraphQL(accessToken);

    if (apiKeySource) {
      console.log(`You are authenticated by API key ${dim(`(process.env.${apiKeySource})`)}`);
      console.log("");
      if (authInfo.type === "user") {
        console.log(`This API key belongs to ${emphasize(userName)} (${userEmail})`);
        console.log(`Recordings you upload are ${emphasize("private")} by default`);
      } else {
        console.log(`This API key belongs to the team named ${emphasize(teamName)}`);
        console.log(`Recordings you upload are ${emphasize("shared")} with other team members`);
      }
      console.log("");
      console.log(`Learn more about API keys at ${link(DOCS_URL)}`);
    } else {
      console.log(`You signed in as ${emphasize(userName)} (${userEmail})`);
      console.log("");
      console.log(`Recordings you upload are ${emphasize("private")} by default`);
      console.log("");
      console.log(`Learn about other ways to sign in at ${link(DOCS_URL)}`);
    }
  } else {
    console.log("You are not authenticated");
    console.log("");
    console.log(`Sign in by running ${highlight(`${packageName} login`)}`);
    console.log("");
    console.log("You can also authenticate with an API key");
    console.log(`Learn more at ${link(DOCS_URL)}`);
  }

  await exitProcess(0);
}
