import { exitProcess } from "../../exitProcess";
import { getFeatureFlagValue } from "../../launch-darkly/getFeatureFlagValue";
import ProtocolClient from "../../protocol/ProtocolClient";
import { AUTHENTICATION_REQUIRED_ERROR_CODE, ProtocolError } from "../../protocol/ProtocolError";
import { highlight, statusFailed } from "../../theme";
import { canUpload } from "../canUpload";
import { createSettledDeferred } from "../createSettledDeferred";
import { debug } from "../debug";
import { printDeferredRecordingActions } from "../printDeferredRecordingActions";
import { printViewRecordingLinks } from "../printViewRecordingLinks";
import { removeFromDisk } from "../removeFromDisk";
import { LocalRecording } from "../types";
import { uploadCrashedData } from "./uploadCrashData";
import { uploadRecording } from "./uploadRecording";

export async function uploadRecordings(
  recordings: LocalRecording[],
  options: {
    deleteOnSuccess?: boolean;
    processAfterUpload: boolean;
  }
) {
  const { deleteOnSuccess = true, processAfterUpload } = options;

  recordings = recordings.filter(recording => {
    if (!canUpload(recording)) {
      debug(`Cannot upload recording ${recording.id}:\n%o`, recording);
      return false;
    }

    return true;
  });

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
        message += " Please try to `replay login` again.";
      }
      console.error(message);
      await exitProcess(1);
      return;
    }
    throw error;
  }

  const deferredActions = recordings.map(recording => {
    if (recording.recordingStatus === "crashed") {
      return createSettledDeferred<LocalRecording>(recording, uploadCrashedData(client, recording));
    } else {
      return createSettledDeferred<LocalRecording>(
        recording,
        uploadRecording(client, recording, { multiPartUpload, processAfterUpload })
      );
    }
  });

  printDeferredRecordingActions(deferredActions);

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  const uploadedRecordings = recordings.filter(recording => recording.uploadStatus === "uploaded");

  printViewRecordingLinks(uploadedRecordings);

  if (deleteOnSuccess) {
    uploadedRecordings.forEach(recording => {
      removeFromDisk(recording.id);
    });
  }

  client.close();
}
