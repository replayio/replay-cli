import { logDebug } from "@replay-cli/shared/logger";
import findProcess from "find-process";
import { getBrowserPath } from "./getBrowserPath";

export async function getRunningProcess() {
  const browserExecutablePath = getBrowserPath();

  const processes = await findProcess("name", browserExecutablePath);
  if (processes.length > 0) {
    const match = processes[0];

    logDebug("GetRunningProcess:AlreadyRunning", { pid: match.pid });

    return match;
  }

  return null;
}
