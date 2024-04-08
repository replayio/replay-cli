import { getFeatureFlagValue } from "../../launch-darkly/getFeatureFlagValue";
import ProtocolClient from "../../protocol/ProtocolClient";
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
  await client.waitUntilAuthenticated();

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

  printDeferredRecordingActions(
    deferredActions,
    "Uploading recordings...",
    "recording(s) did not upload successfully",
    recording => {
      switch (recording.processingStatus) {
        case "processed":
          return "(uploaded, processed)";
        case "processing":
          return "(processing…)";
      }

      switch (recording.uploadStatus) {
        case "failed":
          return "(failed)";
        case "uploading":
          return "(uploading…)";
        case "uploaded":
          return "(uploaded)";
      }
    }
  );

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
