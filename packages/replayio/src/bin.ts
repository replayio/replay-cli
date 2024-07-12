import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { logError } from "@replay-cli/shared/logger";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { initializeSession } from "@replay-cli/shared/session/initializeSession";
import { name as packageName, version as packageVersion } from "../package.json";
import { finalizeCommander } from "./utils/commander/finalizeCommander";

// Commands self-register with "commander"
import "./commands/info";
import "./commands/list";
import "./commands/login";
import "./commands/logout";
import "./commands/open";
import "./commands/record";
import "./commands/remove";
import "./commands/update";
import "./commands/upload";
import "./commands/upload-source-maps";
import "./commands/whoami";

getAccessToken().then(({ accessToken }) => {
  initializeSession({
    accessToken,
    packageName,
    packageVersion,
  });
});

finalizeCommander();

// If the process is terminated by CTRL+C while waiting for an async function
// avoid ERR_UNHANDLED_REJECTION from being printed to the console
process.on("uncaughtException", async error => {
  if (error.name !== "UnhandledPromiseRejection") {
    logError("UncaughtException", { error });
    console.error(error);
  }

  await exitProcess(1);
});
