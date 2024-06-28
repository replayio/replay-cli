import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { killProcess } from "@replay-cli/shared/process/killProcess";
import { confirm } from "../confirm";
import { getRunningProcess } from "./getRunningProcess";

export async function killBrowserIfRunning() {
  const process = await getRunningProcess();
  if (process) {
    const confirmed = await confirm(
      "The replay browser is already running. You'll need to close it before running this command.\n\nWould you like to close it now?",
      true
    );
    if (confirmed) {
      const killResult = await killProcess(process.pid);
      if (!killResult) {
        console.log("Something went wrong trying to close the replay browser. Please try again.");

        await exitProcess(1);
      }
    } else {
      await exitProcess(0);
    }
  }
}
