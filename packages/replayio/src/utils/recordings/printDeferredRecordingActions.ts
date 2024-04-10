import { dots } from "cli-spinners";
import logUpdate from "log-update";
import { Deferred, STATUS_RESOLVED } from "../createDeferred";
import { printTable } from "../table";
import { statusFailed, statusPending, statusSuccess } from "../theme";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

// log-update interferes with verbose output
const isDebug = !!process.env.DEBUG;

let logMessage: Function = logUpdate;
let loggingDone: Function = logUpdate.done;
if (isDebug) {
  logMessage = console.log.bind(console);
  loggingDone = () => {};
}

export async function printDeferredRecordingActions(
  deferredActions: Deferred<boolean, LocalRecording>[],
  {
    renderTitle,
    renderExtraColumns,
  }: {
    renderTitle: (options: { done: boolean }) => string;
    renderExtraColumns: (recording: LocalRecording) => string[];
  }
) {
  let dotIndex = 0;

  const print = (done = false) => {
    const dot = dots.frames[++dotIndex % dots.frames.length];
    const title = renderTitle({ done });
    const table = printTable({
      rows: deferredActions.map(deferred => {
        let status = !isDebug ? statusPending(dot) : "";
        if (deferred.resolution === true) {
          status = statusSuccess("✔");
        } else if (deferred.resolution === false) {
          status = statusFailed("✘");
        }
        const recording = deferred.data;
        const { date, duration, id, title } = formatRecording(recording);
        return [status, id, title, date, duration, ...renderExtraColumns(recording)];
      }),
    });

    logMessage(title + "\n" + table);
  };

  print();

  const interval = !isDebug ? setInterval(print, dots.interval) : undefined;

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  clearInterval(interval);
  print(true);
  loggingDone();

  const failedActions = deferredActions.filter(deferred => deferred.status !== STATUS_RESOLVED);
  if (failedActions.length > 0) {
    console.log(statusFailed(`${failedActions.length} recording(s) did not upload successfully\n`));
  }
}
