import { logError } from "@replay-cli/shared/logger";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { initUndiciProxy } from "@replay-cli/shared/proxy";
import { finalizeCommander } from "./utils/commander/finalizeCommander";

// Route all undici fetch() calls through the proxy if configured
initUndiciProxy();

// Commands self-register with "commander"
import "./commands/info";
import "./commands/list";
import "./commands/login";
import "./commands/logout";
import "./commands/browser";
import "./commands/agent";
import "./commands/open";
import "./commands/record";
import "./commands/remove";
import "./commands/update";
import "./commands/upload";
import "./commands/upload-source-maps";
import "./commands/whoami";

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
