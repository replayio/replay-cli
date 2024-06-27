import { dots } from "cli-spinners";
import { Deferred, STATUS_RESOLVED } from "../async/createDeferred";
import { disableAnimatedLog } from "../config";
import { logUpdate } from "../logUpdate";
import { printTable } from "../printTable";
import { statusFailed, statusPending, statusSuccess } from "../theme";
import { formatRecording } from "./formatRecording";
import { LocalRecording } from "./types";

export async function printDeferredRecordingActions(
  deferredActions: Deferred<boolean, LocalRecording>[],
  {
    renderTitle,
    renderExtraColumns,
    renderFailedSummary,
  }: {
    renderTitle: (options: { done: boolean }) => string;
    renderExtraColumns: (recording: LocalRecording) => string[];
    renderFailedSummary: (failedRecordings: LocalRecording[]) => string;
  }
) {
  let dotIndex = 0;

  const print = (done = false) => {
    const dot = dots.frames[++dotIndex % dots.frames.length];
    const title = renderTitle({ done });
    const table = printTable({
      rows: deferredActions.map(deferred => {
        let status = disableAnimatedLog ? "" : statusPending(dot);
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

    logUpdate(title + "\n" + table);
  };

  print();

  const interval = disableAnimatedLog ? undefined : setInterval(print, dots.interval);

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  clearInterval(interval);
  print(true);
  logUpdate.done();

  const failedActions = deferredActions.filter(deferred => deferred.status !== STATUS_RESOLVED);
  if (failedActions.length > 0) {
    const failedSummary = renderFailedSummary(failedActions.map(action => action.data));
    console.log(statusFailed(`${failedSummary}`) + "\n");
  }
}
