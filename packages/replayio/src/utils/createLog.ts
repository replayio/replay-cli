//  ignore tsc in this file
// @ts-nocheck

import debug from "debug";
import { appendFileSync } from "fs";
import { ensureFileSync } from "fs-extra/esm";
import util from "util";
import { getReplayPath } from "./getReplayPath.js";

export function createLog(name: string, logFilePath?: string) {
  const logger = debug(`replayio:${name}`);

  if (logFilePath) {
    logFilePath = getReplayPath(logFilePath);
  }

  if (logFilePath) {
    try {
      ensureFileSync(logFilePath);
    } catch (error) {
      logFilePath = undefined;
      logger("Failed to create log directory %o", error);
    }
  }

  return function log(formatter: string, ...args: any[]) {
    logger(formatter, ...args);

    if (logFilePath) {
      try {
        const formatted = util.format(formatter, ...args);

        appendFileSync(logFilePath, `${formatted}\n`);
      } catch (error) {
        logger("Failed to write log %o", error);
      }
    }
  };
}
