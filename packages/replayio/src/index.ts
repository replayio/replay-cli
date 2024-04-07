import { finalizeCommander } from "./utils/commander";
import { exitProcess } from "./utils/exitProcess";

// Commands self-register with "commander"
import "./commands/list";
import "./commands/login";
import "./commands/logout";
import "./commands/record";
import "./commands/remove";
import "./commands/setup";
import "./commands/update";
import "./commands/upload-source-maps";
import "./commands/upload";
import "./commands/view";

finalizeCommander();

// If the process is terminated by CTRL+C while waiting for an async function
// avoid ERR_UNHANDLED_REJECTION from being printed to the console
process.on("uncaughtException", async error => {
  if (error.name !== "UnhandledPromiseRejection") {
    console.error("uncaughtException:", error);
  }

  await exitProcess(1);
});
