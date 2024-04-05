import assert from "assert";
import chalk from "chalk";
import { dots } from "cli-spinners";
import logUpdate from "log-update";
import { Deferred, STATUS_REJECTED, STATUS_RESOLVED } from "../createDeferred";
import { printTable } from "../table";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

let logMessage: Function = logUpdate;
let loggingDone: Function = logUpdate.done;
if (process.env.DEBUG) {
  // log-update interferes with verbose output
  logMessage = () => {};
  loggingDone = () => {};
}

export async function printDeferredRecordingActions(
  deferredActions: Deferred<boolean, LocalRecording>[],
  inProgressMessage: string,
  failedMessage: string
) {
  let dotIndex = 0;

  const print = () => {
    const dot = dots.frames[++dotIndex % dots.frames.length];

    logMessage(
      `${inProgressMessage}\n` +
        printTable(
          deferredActions.map(deferred => {
            let status = chalk.yellowBright(dot);
            let suffix = "";
            if (deferred.resolution === true) {
              status = chalk.greenBright("✔");
            } else if (deferred.resolution === false) {
              status = chalk.redBright("✘");
              suffix = chalk.gray("(failed)");
            }

            const recording = deferred.data;
            assert(recording, "Recording is not defined");

            const { date, duration, id, title } = formatRecording(recording);

            return [status, id, title, date, duration, suffix];
          })
        )
    );
  };

  print();

  const interval = setInterval(print, dots.interval);

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  clearInterval(interval);
  print();
  loggingDone();

  const failedActions = deferredActions.filter(deferred => deferred.status !== STATUS_RESOLVED);
  if (failedActions.length > 0) {
    console.log(chalk.red(`${failedActions.length} ${failedMessage}\n`));
  }
}
