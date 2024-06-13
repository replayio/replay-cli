// TODO [PRO-629] Move this into the "shared" package.

import { homedir } from "os";
import { join, resolve } from "path";

export function getReplayPath(...path: string[]) {
  let basePath;
  if (process.env.RECORD_REPLAY_DIRECTORY) {
    basePath = process.env.RECORD_REPLAY_DIRECTORY;
  } else {
    basePath = join(homedir(), ".replay");
  }

  return resolve(join(basePath, ...path));
}
