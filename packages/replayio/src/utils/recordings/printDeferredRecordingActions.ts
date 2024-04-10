import assert from "assert";
import { dots } from "cli-spinners";
import logUpdate from "log-update";
import { Deferred, STATUS_RESOLVED } from "../createDeferred";
import { printTable } from "../table";
import { dim, statusFailed, statusPending, statusSuccess } from "../theme";
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

function getRecordingStatus(recording: LocalRecording): string | undefined {
  switch (recording.uploadStatus) {
    case "failed":
      return "(failed)";
    case "uploading":
      return "(uploading…)";
    case "uploaded":
      return "(uploaded)";
  }
}

export async function printDeferredRecordingActions(
  deferredActions: Deferred<boolean, LocalRecording>[]
) {
  let dotIndex = 0;

  const print = (done = false) => {
    const dot = dots.frames[++dotIndex % dots.frames.length];
    const table = printTable({
      rows: deferredActions.map(deferred => {
        let status = !isDebug ? statusPending(dot) : "";
        if (deferred.resolution === true) {
          status = statusSuccess("✔");
        } else if (deferred.resolution === false) {
          status = statusFailed("✘");
        }

        const suffix = dim(getRecordingStatus(deferred.data) ?? "");

        const recording = deferred.data;
        assert(recording, "Recording is not defined");

        const { date, duration, id, title } = formatRecording(recording);

        return [status, id, title, date, duration, suffix];
      }),
    });

    logMessage((done ? "Uploaded recordings" : `Uploading recordings...`) + "\n" + table);
  };

  print();

  const interval = isDebug ? setInterval(print, dots.interval) : undefined;

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  clearInterval(interval);
  print(true);
  loggingDone();

  const failedActions = deferredActions.filter(deferred => deferred.status !== STATUS_RESOLVED);
  if (failedActions.length > 0) {
    console.log(statusFailed(`${failedActions.length} recording(s) did not upload successfully\n`));
  }
}
