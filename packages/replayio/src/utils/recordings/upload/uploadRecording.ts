import assert from "assert";
import { createReadStream, stat, statSync } from "fs-extra";
import fetch from "node-fetch";
import promiseMap from "p-map";
import { join } from "path";
import { Worker } from "worker_threads";
import { replayServer } from "../../../config";
import { getUserAgent } from "../../getUserAgent";
import ProtocolClient from "../../protocol/ProtocolClient";
import { beginRecordingMultipartUpload } from "../../protocol/api/beginRecordingMultipartUpload";
import { beginRecordingUpload } from "../../protocol/api/beginRecordingUpload";
import { endRecordingMultipartUpload } from "../../protocol/api/endRecordingMultipartUpload";
import { endRecordingUpload } from "../../protocol/api/endRecordingUpload";
import { processRecording } from "../../protocol/api/processRecording";
import { setRecordingMetadata } from "../../protocol/api/setRecordingMetadata";
import { retryWithExponentialBackoff, retryWithLinearBackoff } from "../../retry";
import { debugLogPath, multiPartChunkSize, multiPartMinSizeThreshold } from "../config";
import { debug } from "../debug";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";
import { uploadSourceMaps } from "./uploadSourceMaps";
import { validateRecordingMetadata } from "./validateRecordingMetadata";

export async function uploadRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: {
    multiPartUpload: boolean;
    processAfterUpload: boolean;
  }
) {
  const { buildId, id, path } = recording;
  assert(path, "Recording path is required");

  const { multiPartUpload, processAfterUpload } = options;

  const { size } = await stat(path);

  debug("Uploading recording %s of size %s", recording.id, size);

  const { metadata, recordingData } = await validateRecordingMetadata(recording);

  recording.uploadStatus = "uploading";

  try {
    if (multiPartUpload && size > multiPartMinSizeThreshold) {
      const { chunkSize, partLinks, recordingId, uploadId } = await beginRecordingMultipartUpload(
        client,
        {
          buildId: buildId,
          maxChunkSize: multiPartChunkSize,
          recordingId: id,
          recordingSize: size,
        }
      );

      updateRecordingLog(recording, {
        kind: RECORDING_LOG_KIND.uploadStarted,
        server: replayServer,
      });

      await retryWithExponentialBackoff(
        () => setRecordingMetadata(client, { metadata, recordingData }),
        (error: unknown, attemptNumber: number) => {
          debug(`Attempt ${attemptNumber} to set metadata failed:\n%j`, error);
        }
      );

      const partIds = await uploadRecordingFileInParts({
        chunkSize,
        partLinks,
        recordingPath: path,
      });

      await endRecordingMultipartUpload(client, { partIds, recordingId, uploadId });
    } else {
      const { recordingId, uploadLink } = await beginRecordingUpload(client, {
        buildId: buildId,
        recordingId: id,
        recordingSize: size,
      });

      updateRecordingLog(recording, {
        kind: RECORDING_LOG_KIND.uploadStarted,
        server: replayServer,
      });

      await retryWithExponentialBackoff(
        () => setRecordingMetadata(client, { metadata, recordingData }),
        (error: unknown, attemptNumber: number) => {
          debug(`Attempt ${attemptNumber} to set metadata failed:\n%j`, error);
        }
      );

      await retryWithExponentialBackoff(
        () =>
          uploadRecordingFile({
            recordingPath: path,
            size,
            uploadLink,
          }),
        (error: unknown, attemptNumber: number) => {
          debug(`Attempt ${attemptNumber} to upload failed:\n%j`, error);
        }
      );

      await endRecordingUpload(client, { recordingId });
    }
  } catch (error) {
    updateRecordingLog(recording, {
      kind: RECORDING_LOG_KIND.uploadFailed,
    });

    recording.uploadStatus = "failed";

    throw error;
  }

  debug("Uploaded %d bytes for recording %s", size, recording.id);

  await uploadSourceMaps(client, recording);

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFinished,
    server: replayServer,
  });

  recording.uploadStatus = "uploaded";

  if (processAfterUpload) {
    debug("Begin processing recording %s ...", recording.id);

    try {
      await client.waitUntilAuthenticated();

      debug(`Processing recording ${recording.id}`);

      // Processing can take a while
      // In some cases it's nicer to give users a URL sooner rather than waiting for processing to complete
      processRecording(client, { recordingId: recording.id });
    } catch (error) {
      debug(`Failed to begin processing recording ${recording.id}\n%o`, error);

      // Processing may have failed to start, but the recording still uploaded successfully
    }
  }
}

async function uploadRecordingFile({
  recordingPath,
  size,
  uploadLink,
}: {
  recordingPath: string;
  size: number;
  uploadLink: string;
}) {
  const file = createReadStream(recordingPath);
  const resp = await fetch(uploadLink, {
    body: file,
    headers: { "Content-Length": size.toString(), "User-Agent": getUserAgent() },
    method: "PUT",
  });

  if (resp.status !== 200) {
    throw new Error(`Failed to upload recording. Response was ${resp.status} ${resp.statusText}`);
  }
}

async function uploadRecordingFileInParts({
  chunkSize,
  partLinks,
  recordingPath,
}: {
  chunkSize: number;
  partLinks: string[];
  recordingPath: string;
}): Promise<string[]> {
  const { size: totalSize } = statSync(recordingPath);

  const results = await promiseMap<string, string>(
    partLinks,
    async (url: string, index: number) => {
      return retryWithLinearBackoff(
        async () => {
          const partNumber = index + 1;
          const start = index * chunkSize;
          const end = Math.min(start + chunkSize, totalSize) - 1; // -1 because end is inclusive

          debug("Uploading part %o", {
            partNumber,
            start,
            end,
            totalSize,
            chunkSize,
          });
          return uploadPart(url, { recordingPath, start, end }, end - start + 1);
        },
        error => {
          debug(`Failed to upload part ${index + 1}. Will be retried: %o`, error);
        },
        10
      );
    },
    { concurrency: 10 }
  );

  return results;
}

async function uploadPart(
  link: string,
  partMeta: { recordingPath: string; start: number; end: number },
  size: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, "./uploadWorker.js"));

    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage({ link, partMeta, size, logPath: debugLogPath });
  });
}
