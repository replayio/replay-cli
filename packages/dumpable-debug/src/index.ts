import debug from "debug";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

function memoize<T>(fn: () => T) {
  let resolved: { v: T } | undefined;
  return () => {
    if (!resolved) {
      resolved = { v: fn() };
    }
    return resolved.v;
  };
}

const getTempDir = memoize(() => fs.realpathSync(os.tmpdir()));

const safeFilenameText = (text: string) => text.replace(/[:/\\/]/g, "-");

const getFilenameDate = () =>
  safeFilenameText(new Date().toISOString()).replace(/\.(\d+)Z$/, "-$1");

function createExtandableDebug(options: {
  namespace: string;
  d: debug.Debugger;
  writeStream: fs.WriteStream;
}): ExtandableDebug {
  const { namespace, d, writeStream } = options;

  function debug(...args: [formatter: string, ...args: unknown[]]) {
    d(...args);
    writeStream.write(`[${namespace}] ` + util.format(...args) + "\n");
  }

  debug.extend = (namespace: string) =>
    createExtandableDebug({
      namespace: `${options.namespace}:${namespace}`,
      d: d.extend(namespace),
      writeStream,
    });

  return debug;
}

export interface ExtandableDebug {
  (formatter: string, ...args: unknown[]): void;
  extend(namespace: string): ExtandableDebug;
}

export default function dumpableDebug(
  namespace: string,
  { outputDir = getTempDir() }: { outputDir?: string } = {}
) {
  ensureDir(outputDir);
  const d = debug(namespace);
  const logFilePath = path.join(
    outputDir,
    `${safeFilenameText(namespace)}-${getFilenameDate()}.log`
  );
  const writeStream = fs.createWriteStream(logFilePath);
  const wrapped = createExtandableDebug({ namespace, d, writeStream }) as ClosableDebug;
  wrapped.closeLogFile = () => {
    return new Promise(resolve => {
      writeStream.close();
      writeStream.once("close", () => {
        resolve(logFilePath);
      });
    });
  };
  return wrapped;
}

export interface ClosableDebug extends ExtandableDebug {
  closeLogFile: () => Promise<string>;
}
