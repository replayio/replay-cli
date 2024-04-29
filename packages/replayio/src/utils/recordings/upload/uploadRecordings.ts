import { exitProcess } from "../../exitProcess.js";
import { getFeatureFlagValue } from "../../launch-darkly/getFeatureFlagValue.js";
import ProtocolClient from "../../protocol/ProtocolClient.js";
import { AUTHENTICATION_REQUIRED_ERROR_CODE, ProtocolError } from "../../protocol/ProtocolError.js";
import { dim, highlight, statusFailed } from "../../theme.js";
import { canUpload } from "../canUpload.js";
import { createSettledDeferred } from "../createSettledDeferred.js";
import { debug } from "../debug.js";
import { printDeferredRecordingActions } from "../printDeferredRecordingActions.js";
import { printViewRecordingLinks } from "../printViewRecordingLinks.js";
import { removeFromDisk } from "../removeFromDisk.js";
import { LocalRecording } from "../types.js";
import { ProcessingBehavior } from "./types.js";
import { uploadCrashedData } from "./uploadCrashData.js";
import { uploadRecording } from "./uploadRecording.js";

export async function uploadRecordings(
  recordings: LocalRecording[],
  options: {
    deleteOnSuccess?: boolean;
    processingBehavior: ProcessingBehavior;
    silent?: boolean;
  }
) {
  const { deleteOnSuccess = true, processingBehavior, silent = false } = options;

  recordings = recordings.filter(recording => {
    if (!canUpload(recording)) {
      debug(`Cannot upload recording ${recording.id}:\n%o`, recording);
      return false;
    }

    return true;
  });

  if (recordings.length === 0) {
    return [];
  }

  const multiPartUpload = await getFeatureFlagValue<boolean>("cli-multipart-upload", false);
  const client = new ProtocolClient();
  try {
    await client.waitUntilAuthenticated();
  } catch (error) {
    if (
      error instanceof ProtocolError &&
      error.protocolCode === AUTHENTICATION_REQUIRED_ERROR_CODE
    ) {
      let message = `${statusFailed("✘")} Authentication failed.`;
      if (process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY) {
        const name = process.env.REPLAY_API_KEY ? "REPLAY_API_KEY" : "RECORD_REPLAY_API_KEY";
        message += ` Please check your ${highlight(name)}.`;
      } else {
        message += ` Please try to ${highlight("replay login")} again.`;
      }
      console.error(message);
      await exitProcess(1);
    }
    throw error;
  }

  const deferredActions = recordings.map(recording => {
    if (recording.recordingStatus === "crashed") {
      return createSettledDeferred<LocalRecording>(recording, uploadCrashedData(client, recording));
    } else {
      return createSettledDeferred<LocalRecording>(
        recording,
        uploadRecording(client, recording, { multiPartUpload, processingBehavior })
      );
    }
  });

  if (!silent) {
    printDeferredRecordingActions(deferredActions, {
      renderTitle: ({ done }) => (done ? "Uploaded recordings" : `Uploading recordings...`),
      renderExtraColumns: recording => {
        let status: string | undefined;
        if (recording.processingStatus) {
          switch (recording.processingStatus) {
            case "processing":
              status = "(processing…)";
              break;
            case "processed":
              status = "(uploaded+processed)";
              break;
          }
        } else {
          switch (recording.uploadStatus) {
            case "failed":
              status = "(failed)";
              break;
            case "uploading":
              status = "(uploading…)";
              break;
            case "uploaded":
              status = "(uploaded)";
              break;
          }
        }
        return [status ? dim(status) : ""];
      },
      renderFailedSummary: failedRecordings =>
        `${failedRecordings.length} recording(s) did not upload successfully`,
    });
  }

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  const uploadedRecordings = recordings.filter(recording => recording.uploadStatus === "uploaded");

  if (!silent) {
    printViewRecordingLinks(uploadedRecordings);
  }

  if (deleteOnSuccess) {
    uploadedRecordings.forEach(recording => {
      removeFromDisk(recording.id);
    });
  }

  client.close();

  return deferredActions.map(action => action.data);
}
