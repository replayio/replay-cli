import { spawn, spawnSync } from "child_process";
import path from "path";
import { cwd } from "process";

import { waitForProcessExit, findExecutablePath } from "./utils";

main();

async function main() {
  function logMessage(prefix: string, msg: string) {
    console.log(`replay-jest${prefix ? " " + prefix : ""}: ${msg}`);
  }

  function logFailure(why: any) {
    logMessage("failed", why);
  }

  // Make sure the replay version of node is installed and updated.
  const replayNodePath = findExecutablePath("replay-node");
  if (!replayNodePath) {
    logFailure(`replay-node not available, try "npm i @replayio/node -g"`);
    return;
  }
  logMessage("", "Updating replay-node ...");
  spawnSync(replayNodePath, ["--update"]);

  // Directory where replay-node will install the node binary.
  const baseReplayDirectory =
    process.env.RECORD_REPLAY_DIRECTORY || path.join(process.env.HOME!, ".replay");
  const replayNodeBinaryPath = path.join(baseReplayDirectory, "node", "node");

  const jestPath = findJestPath();
  if (!jestPath) {
    logFailure(`Could not find jest path`);
    return;
  }

  const replayProcess = spawn(replayNodeBinaryPath, [jestPath, ...process.argv.slice(2)], {
    stdio: "inherit",
  });

  const { code, signal } = await waitForProcessExit(replayProcess);

  process.exit(code || (signal ? 1 : 0));
}

function findJestPath() {
  try {
    return require.resolve("jest/bin/jest", {
      paths: [cwd()],
    });
  } catch (e) {
    console.error(e);
  }
  return findExecutablePath("jest");
}
