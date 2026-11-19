import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { logError } from "@replay-cli/shared/logger";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { createUploadWorker } from "@replay-cli/shared/recording/upload/uploadWorker";
import assert from "node:assert/strict";

const pollInterval = 1_000;

// Starts uploading the process group's recordings as soon as the recorder begins writing them.
// `end` must be called once the recorder has exited.
export async function startStreamedUploads(processGroupId: string) {
  const { accessToken } = await getAccessToken();
  assert(accessToken, "No access token found");

  const recorderExited = new AbortController();
  const worker = createUploadWorker({
    accessToken,
    processingBehavior: "do-not-process",
    streamedUpload: { recorderExited: recorderExited.signal },
  });

  // Log IDs; an upload may replace a recording's ID
  const startedIds = new Set<string>();

  const startUploads = () => {
    for (const recording of getRecordings(processGroupId)) {
      if (!startedIds.has(recording.id) && canUpload(recording, { streamedUpload: true })) {
        startedIds.add(recording.id);
        worker.upload(recording);
      }
    }
  };

  const interval = setInterval(() => {
    try {
      startUploads();
    } catch (error) {
      // Retried on the next poll and in `end`
      logError("StreamedUploads:StartFailed", { error });
    }
  }, pollInterval);

  return {
    startedIds,
    end: async () => {
      clearInterval(interval);
      recorderExited.abort();
      startUploads();

      return worker.end();
    },
  };
}
