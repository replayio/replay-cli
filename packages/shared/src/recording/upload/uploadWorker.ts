import { createDeferred, Deferred } from "../../async/createDeferred";
import { getFeatureFlagValue } from "../../launch-darkly/getFeatureFlagValue";
import ProtocolClient from "../../protocol/ProtocolClient";
import { createSettledDeferred } from "../createSettledDeferred";
import { removeFromDisk } from "../removeFromDisk";
import { LocalRecording } from "../types";
import { ProcessingBehavior } from "./types";
import { uploadCrashedData } from "./uploadCrashData";
import { uploadRecording } from "./uploadRecording";

export function createUploadWorker({
  deleteOnSuccess,
  processingBehavior,
}: {
  deleteOnSuccess?: boolean;
  processingBehavior: ProcessingBehavior;
}) {
  const client = new ProtocolClient();
  const deferredAuthenticated = createDeferred<boolean>();
  const deferredActions: Deferred<boolean, LocalRecording>[] = [];

  let multiPartUpload = false;

  (async () => {
    multiPartUpload = await getFeatureFlagValue<boolean>("cli-multipart-upload", false);
    try {
      await client.waitUntilAuthenticated();
      deferredAuthenticated.resolve(true);
    } catch (error: any) {
      deferredAuthenticated.reject(error);
    }
  })();

  return {
    upload: (recording: LocalRecording) => {
      const deferred = createSettledDeferred(recording, async () => {
        await deferredAuthenticated.promise;

        if (recording.recordingStatus === "crashed") {
          await uploadCrashedData(client, recording);
        } else {
          await uploadRecording(client, recording, { multiPartUpload, processingBehavior });
        }
      });
      deferredActions.push(deferred);
      return deferred;
    },
    onEnd: async () => {
      try {
        await deferredAuthenticated.promise;
      } catch (err) {
        client.close();
        throw err;
      }

      await Promise.all(deferredActions.map(deferred => deferred.promise));

      client.close();

      const recordings = deferredActions.map(action => action.data);

      if (deleteOnSuccess) {
        recordings
          .filter(recording => recording.uploadStatus === "uploaded")
          .forEach(recording => {
            removeFromDisk(recording.id);
          });
      }

      return recordings;
    },
  };
}
