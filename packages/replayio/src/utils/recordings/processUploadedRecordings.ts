import { wait } from "../wait";
import { createdDeferredAction } from "./createdDeferredAction";
import { debug } from "./debug";
import { printDeferredRecordingActions } from "./printDeferredRecordingActions";
import { LocalRecording } from "./types";

export async function processUploadedRecordings(recordings: LocalRecording[]) {
  recordings = recordings.filter(recording => {
    if (recording.uploadStatus !== "uploaded") {
      debug(`Cannot process recording ${recording.id}:\n%o`, recording);
      return false;
    }

    return true;
  });

  debug(`Processing ${recordings.length} recording(s)`);

  const deferredActions = recordings.map(recording =>
    createdDeferredAction(recording, processUploadedRecording(recording))
  );

  printDeferredRecordingActions(
    deferredActions,
    "Processing recordings...",
    "recording(s) did not finish processing"
  );

  await Promise.all(deferredActions.map(deferred => deferred.promise));
}

async function processUploadedRecording(recording: LocalRecording) {
  // TODO [PRO-*] Process and wait
  await wait(2_000 + Math.random() * 5_000);
  if (Math.random() > 0.7) {
    throw Error("Processing failed");
  }
}
