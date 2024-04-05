import { getFeatureFlagValue } from "../../launch-darkly/getFeatureFlagValue";
import ProtocolClient from "../../protocol/ProtocolClient";
import { canUpload } from "../canUpload";
import { createdDeferredAction } from "../createdDeferredAction";
import { debug } from "../debug";
import { printDeferredRecordingActions } from "../printDeferredRecordingActions";
import { LocalRecording } from "../types";
import { uploadCrashedData } from "./uploadCrashData";
import { uploadRecording } from "./uploadRecording";

export async function uploadRecordings(recordings: LocalRecording[]) {
  recordings = recordings.filter(recording => {
    if (!canUpload(recording)) {
      debug(`Cannot upload recording ${recording.id}:\n%o`, recording);
      return false;
    }

    return true;
  });

  const multipart = await getFeatureFlagValue<boolean>("cli-multipart-upload", false);
  const client = new ProtocolClient();
  await client.waitUntilAuthenticated();

  const deferredActions = recordings.map(recording => {
    if (recording.recordingStatus === "crashed") {
      return createdDeferredAction<LocalRecording>(recording, uploadCrashedData(client, recording));
    } else {
      return createdDeferredAction<LocalRecording>(
        recording,
        uploadRecording(client, recording, multipart)
      );
    }
  });

  printDeferredRecordingActions(
    deferredActions,
    "Uploading recordings...",
    "recording(s) did not upload successfully"
  );

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  client.close();
}
