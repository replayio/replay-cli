import { finalizeCommander } from "./utils/commander/finalizeCommander.js";
import { exitProcess } from "./utils/exitProcess.js";

// Commands self-register with "commander"
import "./commands/info.js";
import "./commands/list.js";
import "./commands/login.js";
import "./commands/logout.js";
import "./commands/record.js";
import "./commands/remove.js";
import "./commands/update.js";
import "./commands/upload.js";
import "./commands/upload-source-maps.js";
import "./commands/watch.js";

finalizeCommander();

// If the process is terminated by CTRL+C while waiting for an async function
// avoid ERR_UNHANDLED_REJECTION from being printed to the console
process.on("uncaughtException", async error => {
  if (error.name !== "UnhandledPromiseRejection") {
    console.error(error);
  }

  await exitProcess(1);
});
