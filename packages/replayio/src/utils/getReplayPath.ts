import assert from "assert";
import { join, resolve } from "path";

export function getReplayPath(...path: string[]) {
  let basePath;
  if (process.env.RECORD_REPLAY_DIRECTORY) {
    basePath = process.env.RECORD_REPLAY_DIRECTORY;
  } else {
    const homeDirectory = process.env.HOME || process.env.USERPROFILE;
    assert(homeDirectory, "HOME or USERPROFILE environment variable must be set");

    basePath = join(homeDirectory, ".replay");
  }

  return resolve(join(basePath, ...path));
}
