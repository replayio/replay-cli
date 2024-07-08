import { ReadStream, createReadStream, stat } from "fs-extra";
import assert from "node:assert/strict";
import { fetch } from "undici";
import { createDeferred } from "../../async/createDeferred";
import { createPromiseQueue } from "../../async/createPromiseQueue";
import { retryWithExponentialBackoff, retryWithLinearBackoff } from "../../async/retryOnFailure";
import { replayWsServer } from "../../config";
import { logger } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { beginRecordingMultipartUpload } from "../../protocol/api/beginRecordingMultipartUpload";
import { beginRecordingUpload } from "../../protocol/api/beginRecordingUpload";
import { endRecordingMultipartUpload } from "../../protocol/api/endRecordingMultipartUpload";
import { endRecordingUpload } from "../../protocol/api/endRecordingUpload";
import { processRecording } from "../../protocol/api/processRecording";
import { setRecordingMetadata } from "../../protocol/api/setRecordingMetadata";
import { getUserAgent } from "../../userAgent";
import { multiPartChunkSize, multiPartMinSizeThreshold } from "../config";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";
import { ProcessingBehavior } from "./types";
import { uploadSourceMaps } from "./uploadSourceMaps";
import { validateRecordingMetadata } from "./validateRecordingMetadata";

const uploadQueue = createPromiseQueue({ concurrency: 10 });

export async function uploadRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: {
    multiPartUpload: boolean;
    processingBehavior: ProcessingBehavior;
  }
) {
  logger.info("UploadRecording:Started", { recordingId: recording.id });
  const { buildId, id, path } = recording;
  assert(path, "Recording path is required");

  const { multiPartUpload, processingBehavior } = options;

  const { size } = await stat(path);

  logger.debug(`Uploading recording ${recording.id} of size ${size}`, { recording });

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
          logger.debug(`Attempt ${attemptNumber} to set metadata failed`, { error });
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
          logger.debug(`Attempt ${attemptNumber} to set metadata failed`, { error });
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
            logger.debug(`Attempt ${attemptNumber} to upload failed`, { error });
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

    logger.error("UploadRecording:Failed", {
      error,
      recordingId: recording.id,
      buildId: recording.buildId,
    });
    recording.uploadStatus = "failed";
    recording.uploadError = error as Error;

    throw error;
  }

  logger.debug(`Uploaded ${size} bytes for recording {recording.id}`);

  if (recording.metadata.sourceMaps.length) {
    await uploadSourceMaps(client, recording);
    logger.debug(`Uploaded source maps for recording ${recording.id}`);
  }

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFinished,
    server: replayWsServer,
  });

  logger.info("UploadRecording:Succeeded", { recording: recording.id });
  recording.uploadStatus = "uploaded";

  switch (processingBehavior) {
    case "start-processing": {
      logger.debug(`Start processing recording ${recording.id} ...`);

      // In this code path, we intentionally don't update the "processingStatus" nor the recording log
      // because this would interfere with how the recordings are printed when the upload has finished

      processRecording(client, { recordingId: recording.id }).catch(() => {
        // Ignore
      });
      break;
    }
    case "wait-for-processing-to-finish": {
      logger.debug(`Begin processing recording ${recording.id} ...`);

      try {
        await client.waitUntilAuthenticated();

        logger.debug(`Processing recording ${recording.id}`);

        updateRecordingLog(recording, {
          kind: RECORDING_LOG_KIND.processingStarted,
        });

        recording.processingStatus = "processing";

        await retryWithExponentialBackoff(
          () => processRecording(client, { recordingId: recording.id }),
          (error: unknown, attemptNumber: number) => {
            logger.debug(`Processing failed after ${attemptNumber} attempts`, { error });
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
  const { size: totalSize } = await stat(recordingPath);
  const abortController = new AbortController();

  const partsUploads = partLinks.map((url: string, index: number) => {
    return uploadQueue.add(async () => {
      try {
        return retryWithLinearBackoff(
          async () => {
            const partNumber = index + 1;
            const start = index * chunkSize;
            const end = Math.min(start + chunkSize, totalSize) - 1; // -1 because end is inclusive

            logger.debug("Uploading part", {
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
          (error: any, attemptNumber: number, maxAttempts: number) => {
            let message = `Failed to upload part ${index + 1}`;
            if (attemptNumber < maxAttempts && error.code !== "ENOENT") {
              message += `; will be retried`;
            }
            logger.error(message, { error });

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
  logger.debug("Uploading chunk", { recordingPath, size, start, end });
  const stream = createReadStream(recordingPath, { start, end });
  const response = await uploadRecordingReadStream(stream, { url, size }, abortSignal);

  const etag = response.headers.get("etag");
  assert(etag, "Etag has to be returned in the response headers");
  logger.debug("Etag received", { etag, recordingPath, size, start, end });

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
        headers: {
          "Content-Length": size.toString(),
          "User-Agent": getUserAgent(),
          Connection: "keep-alive",
        },
        method: "PUT",
        body: stream,
        duplex: "half",
        signal: abortSignal,
      }),
      streamError.promise,
    ]);

    logger.debug("Fetch response received", { response });

    if (!response.ok) {
      const respText = await response.text();
      logger.debug(`Fetch response text: ${respText}`);
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
