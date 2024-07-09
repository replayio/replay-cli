import { logger } from "@replay-cli/shared/logger";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { setUserAgent } from "@replay-cli/shared/userAgent";
import { name, version } from "../package.json";
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

logger.initialize(name, version);

setUserAgent(`${name}/${version}`);

finalizeCommander();

// If the process is terminated by CTRL+C while waiting for an async function
// avoid ERR_UNHANDLED_REJECTION from being printed to the console
process.on("uncaughtException", async error => {
  if (error.name !== "UnhandledPromiseRejection") {
    logger.error("UncaughtException", { error });
    console.error(error);
  }

  await exitProcess(1);
});
