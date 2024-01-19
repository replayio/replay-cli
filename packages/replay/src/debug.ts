import dbg from "debug";
import fs from "fs";
import path from "path";
import util from "util";
import { getDirectory } from "./utils";

const debugDebug = dbg("replay:cli:debug");

const logDirPath = path.join(getDirectory(), "logs");
const logPath = path.join(
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
  } catch (e) {
    debugDebug("Failed to create log directory %o", e);
  }
}

let size = 0;
export default function debug(namespace: string) {
  size = Math.max(size, namespace.length);
  const d = dbg(namespace);

  if (process.env.REPLAY_CLI_DISABLE_LOG) {
    return d;
  }

  return (formatter: string, ...args: any[]) => {
    d(formatter, ...args);
    try {
      const output = util
        .format(formatter, ...args)
        .split("\n")
        .map((l, i) => (i === 0 ? l : "".padStart(size + 3, " ") + l))
        .join("\n");
      const prefix = `[${namespace}] `.padStart(size + 3, " ");
      fs.appendFileSync(logPath, `${prefix}${output}\n`);
    } catch (e) {
      debugDebug("Failed to write log %o", e);
    }
  };
}

init();
