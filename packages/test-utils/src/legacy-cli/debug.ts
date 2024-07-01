import fs from "fs";
import path from "path";
import { getDirectory } from "./utils";
import { logger } from "@replay-cli/shared/logger";

const logDirPath = path.join(getDirectory(), "logs");
export let logPath = path.join(
  logDirPath,
  "cli-" +
    new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\.(\d+)Z$/, "-$1.log")
);

function init() {
  try {
    fs.mkdirSync(logDirPath, { recursive: true });
  } catch (error) {
    logPath = "";
    logger.error("Init:FailedToCreateLogDirectory", { error });
  }
}

init();
