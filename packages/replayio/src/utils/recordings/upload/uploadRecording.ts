import assert from "assert";
import { ReadStream, createReadStream } from "fs";
import fsExtra from "fs-extra";
import fetch from "node-fetch";
import { replayWsServer } from "../../../config.js";
import { createDeferred } from "../../async/createDeferred.js";
import { createPromiseQueue } from "../../async/createPromiseQueue.js";
import { retryWithExponentialBackoff, retryWithLinearBackoff } from "../../async/retry.js";
import { getUserAgent } from "../../getUserAgent.js";
import ProtocolClient from "../../protocol/ProtocolClient.js";
import { beginRecordingMultipartUpload } from "../../protocol/api/beginRecordingMultipartUpload.js";
import { beginRecordingUpload } from "../../protocol/api/beginRecordingUpload.js";
import { endRecordingMultipartUpload } from "../../protocol/api/endRecordingMultipartUpload.js";
import { endRecordingUpload } from "../../protocol/api/endRecordingUpload.js";
import { processRecording } from "../../protocol/api/processRecording.js";
import { setRecordingMetadata } from "../../protocol/api/setRecordingMetadata.js";
import { getKeepAliveAgent } from "../../protocol/getKeepAliveAgent.js";
import { multiPartChunkSize, multiPartMinSizeThreshold } from "../config.js";
import { debug } from "../debug.js";
import { LocalRecording, RECORDING_LOG_KIND } from "../types.js";
import { updateRecordingLog } from "../updateRecordingLog.js";
import { ProcessingBehavior } from "./types.js";
import { uploadSourceMaps } from "./uploadSourceMaps.js";
import { validateRecordingMetadata } from "./validateRecordingMetadata.js";

const uploadQueue = createPromiseQueue({ concurrency: 10 });

export async function uploadRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: {
    multiPartUpload: boolean;
    processingBehavior: ProcessingBehavior;
  }
) {
  const { buildId, id, path } = recording;
  assert(path, "Recording path is required");

  const { multiPartUpload, processingBehavior } = options;

  const { size } = await fsExtra.stat(path);

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
        server: replayWsServer,
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
        server: replayWsServer,
      });

      await retryWithExponentialBackoff(
        () => setRecordingMetadata(client, { metadata, recordingData }),
        (error: unknown, attemptNumber: number) => {
          debug(`Attempt ${attemptNumber} to set metadata failed:\n%j`, error);
        }
      );
      await uploadQueue.add(() =>
        retryWithExponentialBackoff(
          () =>
            uploadRecordingFile({
              recordingPath: path,
              size,
              url: uploadLink,
            }),
          (error: any, attemptNumber: number) => {
            debug(`Attempt ${attemptNumber} to upload failed:\n%j`, error);
            if (error.code === "ENOENT") {
              throw error;
            }
          }
        )
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

  if (recording.metadata.sourceMaps.length) {
    await uploadSourceMaps(client, recording);
    debug("Uploaded source maps for recording %s", recording.id);
  }

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFinished,
    server: replayWsServer,
  });

  recording.uploadStatus = "uploaded";

  switch (processingBehavior) {
    case "start-processing": {
      debug("Start processing recording %s ...", recording.id);

      // In this code path, we intentionally don't update the "processingStatus" nor the recording log
      // because this would interfere with how the recordings are printed when the upload has finished

      processRecording(client, { recordingId: recording.id }).catch(error => {
        // Ignore
      });
      break;
    }
    case "wait-for-processing-to-finish": {
      debug("Begin processing recording %s ...", recording.id);

      try {
        await client.waitUntilAuthenticated();

        debug(`Processing recording ${recording.id}`);

        updateRecordingLog(recording, {
          kind: RECORDING_LOG_KIND.processingStarted,
        });

        recording.processingStatus = "processing";

        await retryWithExponentialBackoff(
          () => processRecording(client, { recordingId: recording.id }),
          (error: unknown, attemptNumber: number) => {
            debug(`Processing failed after ${attemptNumber} attempts:\n%j`, error);
          }
        );

        updateRecordingLog(recording, {
          kind: RECORDING_LOG_KIND.processingFinished,
        });

        recording.processingStatus = "processed";
      } catch (error) {
        // Processing may have failed to start, but the recording still uploaded successfully

        updateRecordingLog(recording, {
          kind: RECORDING_LOG_KIND.processingFailed,
        });

        recording.processingStatus = "failed";
      }
      break;
    }
  }
}

async function uploadRecordingFile({
  recordingPath,
  size,
  url,
}: {
  recordingPath: string;
  size: number;
  url: string;
}) {
  const stream = createReadStream(recordingPath);
  await uploadRecordingReadStream(stream, { url, size });
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
  const { size: totalSize } = await fsExtra.stat(recordingPath);
  const abortController = new AbortController();

  const partsUploads = partLinks.map((url: string, index: number) => {
    return uploadQueue.add(async () => {
      try {
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
            return uploadPart(
              { url, recordingPath, start, end, size: end - start + 1 },
              abortController.signal
            );
          },
          (error: any) => {
            debug(`Failed to upload part ${index + 1}. Will be retried: %o`, error);
            if (error.code === "ENOENT") {
              throw error;
            }
          }
        );
      } catch (error) {
        abortController.abort();
        throw error;
      }
    });
  });

  return Promise.all(partsUploads);
}

async function uploadPart(
  {
    url,
    recordingPath,
    start,
    end,
    size,
  }: {
    url: string;
    recordingPath: string;
    start: number;
    end: number;
    size: number;
  },
  abortSignal: AbortSignal
): Promise<string> {
  debug("Uploading chunk %o", { recordingPath, size, start, end });
  const stream = createReadStream(recordingPath, { start, end });
  const response = await uploadRecordingReadStream(stream, { url, size }, abortSignal);

  const etag = response.headers.get("etag");
  assert(etag, "Etag has to be returned in the response headers");
  debug("Etag received %o", { etag, recordingPath, size, start, end });

  return etag;
}

async function uploadRecordingReadStream(
  stream: ReadStream,
  { url, size }: { url: string; size: number },
  abortSignal?: AbortSignal
) {
  abortSignal?.throwIfAborted();

  const streamError = createDeferred<never>();
  const closeStream = () => stream.close();
  stream.on("error", streamError.reject);

  try {
    const response = await Promise.race([
      fetch(url, {
        agent: getKeepAliveAgent,
        headers: {
          "Content-Length": size.toString(),
          "User-Agent": getUserAgent(),
          Connection: "keep-alive",
        },
        method: "PUT",
        body: stream,
        signal: abortSignal,
      }),
      streamError.promise,
    ]);

    debug(
      `Fetch response received. Status: ${response.status}, Status Text: ${response.statusText}`
    );

    if (response.status !== 200) {
      const respText = await response.text();
      debug(`Fetch response text: ${respText}`);
      throw new Error(
        `Failed to upload recording. Response was ${response.status} ${response.statusText}`
      );
    }

    return response;
  } finally {
    // it's idempotent but it has to be closed manually when the upload gets aborted
    closeStream();
  }
}
