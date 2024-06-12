import { finalizeCommander } from "./utils/commander/finalizeCommander";
import { exitProcess } from "./utils/exitProcess";

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

finalizeCommander();

// If the process is terminated by CTRL+C while waiting for an async function
// avoid ERR_UNHANDLED_REJECTION from being printed to the console
process.on("uncaughtException", async error => {
  if (error.name !== "UnhandledPromiseRejection") {
    console.error(error);
  }

  await exitProcess(1);
});
