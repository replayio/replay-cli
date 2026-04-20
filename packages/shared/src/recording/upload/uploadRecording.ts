import { ReadStream, createReadStream, readFile, stat, writeFile } from "fs-extra";
import assert from "node:assert/strict";
import { fetch } from "undici";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { createDeferred } from "../../async/createDeferred";
import { createPromiseQueue } from "../../async/createPromiseQueue";
import { retryWithExponentialBackoff, retryWithLinearBackoff } from "../../async/retryOnFailure";
import { replayWsServer } from "../../config";
import { logDebug, logError, logInfo } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { beginRecordingMultipartUpload } from "../../protocol/api/beginRecordingMultipartUpload";
import { beginRecordingUpload } from "../../protocol/api/beginRecordingUpload";
import { endRecordingMultipartUpload } from "../../protocol/api/endRecordingMultipartUpload";
import { endRecordingUpload } from "../../protocol/api/endRecordingUpload";
import { processRecording } from "../../protocol/api/processRecording";
import { setRecordingMetadata } from "../../protocol/api/setRecordingMetadata";
import { getUserAgent } from "../../session/getUserAgent";
import { waitForPackageInfo } from "../../session/waitForPackageInfo";
import { multiPartChunkSize, multiPartMinSizeThreshold } from "../config";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";
import { ProcessingBehavior } from "./types";
import { uploadSourceMaps } from "./uploadSourceMaps";
import { validateRecordingMetadata } from "./validateRecordingMetadata";

const uploadQueue = createPromiseQueue({ concurrency: 10 });

async function setMetadataWithRetry(
  client: ProtocolClient,
  metadata: Record<string, unknown>,
  recordingData: Record<string, unknown>
) {
  await retryWithExponentialBackoff(
    () => setRecordingMetadata(client, { metadata, recordingData }),
    (error: unknown, attemptNumber: number) => {
      logDebug(`Attempt ${attemptNumber} to set metadata failed`, { error });
      if (attemptNumber === 1) {
        const filePath = join(tmpdir(), `replay-metadata-${Date.now()}.txt`);
        const content = inspect(
          { metadata, recordingData },
          { depth: null, maxStringLength: null }
        );
        writeFile(filePath, content).then(() => {
          logDebug(`Metadata written to ${filePath}`);
        });
      }
    }
  );
}

export async function uploadRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: {
    accessToken: string;
    multiPartUpload: boolean;
    noPresigned?: boolean;
    processingBehavior: ProcessingBehavior;
  }
) {
  logInfo("UploadRecording:Started", { recordingId: recording.id });
  const { buildId, id, path } = recording;
  assert(path, "Recording path is required");

  const { accessToken, multiPartUpload, noPresigned, processingBehavior } = options;

  const { size } = await stat(path);

  logDebug(`Uploading recording ${recording.id} of size ${size}`, { recording });

  const { metadata, recordingData } = await validateRecordingMetadata(recording);

  recording.uploadStatus = "uploading";

  try {
    if (noPresigned) {
      updateRecordingLog(recording, {
        kind: RECORDING_LOG_KIND.uploadStarted,
        server: replayWsServer,
      });

      const recordingId = await uploadRecordingWithoutPresignedUrls({
        accessToken,
        recordingId: id,
        recordingPath: path,
        size,
      });

      // The server assigns a new recording ID; update local state so
      // metadata, processing, and view links use the correct ID.
      recording.id = recordingId;
      recordingData.id = recordingId;

      await setMetadataWithRetry(client, metadata, recordingData);
    } else if (multiPartUpload && size > multiPartMinSizeThreshold) {
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

      await setMetadataWithRetry(client, metadata, recordingData);

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

      await setMetadataWithRetry(client, metadata, recordingData);
      await uploadQueue.add(() =>
        retryWithExponentialBackoff(
          () =>
            uploadRecordingFile({
              recordingPath: path,
              size,
              url: uploadLink,
            }),
          (error: any, attemptNumber: number) => {
            logDebug(`Attempt ${attemptNumber} to upload failed`, { error });
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

    logError("UploadRecording:Failed", {
      error,
      recordingId: recording.id,
      buildId: recording.buildId,
    });
    recording.uploadStatus = "failed";
    recording.uploadError = error as Error;

    throw error;
  }

  logDebug(`Uploaded ${size} bytes for recording {recording.id}`);

  if (recording.metadata.sourceMaps.length) {
    await uploadSourceMaps(client, recording);
    logDebug(`Uploaded source maps for recording ${recording.id}`);
  }

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFinished,
    server: replayWsServer,
  });

  logInfo("UploadRecording:Succeeded", { recording: recording.id });
  recording.uploadStatus = "uploaded";

  switch (processingBehavior) {
    case "start-processing": {
      logDebug(`Start processing recording ${recording.id} ...`);

      // In this code path, we intentionally don't update the "processingStatus" nor the recording log
      // because this would interfere with how the recordings are printed when the upload has finished

      processRecording(client, { recordingId: recording.id }).catch(() => {
        // Ignore
      });
      break;
    }
    case "wait-for-processing-to-finish": {
      logDebug(`Begin processing recording ${recording.id} ...`);

      try {
        await client.waitUntilAuthenticated();

        logDebug(`Processing recording ${recording.id}`);

        updateRecordingLog(recording, {
          kind: RECORDING_LOG_KIND.processingStarted,
        });

        recording.processingStatus = "processing";

        await retryWithExponentialBackoff(
          () => processRecording(client, { recordingId: recording.id }),
          (error: unknown, attemptNumber: number) => {
            logDebug(`Processing failed after ${attemptNumber} attempts`, { error });
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

            logDebug("Uploading part", {
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
            logError(message, { error });

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
  logInfo("UploadRecording:UploadPart:Started", {
    recordingPath,
    size,
    start,
    end,
  });
  const stream = createReadStream(recordingPath, { start, end });
  try {
    const response = await uploadRecordingReadStream(stream, { url, size }, abortSignal);
    const etag = response.headers.get("etag");

    logInfo("UploadRecording:UploadPart:Succeeded", {
      recordingPath,
      size,
      start,
      end,
      etag,
    });

    assert(etag, "Etag has to be returned in the response headers");
    return etag;
  } catch (error) {
    logError("UploadRecording:UploadPart:Failed", {
      recordingPath,
      size,
      start,
      end,
    });
    throw error;
  }
}

const NO_PRESIGNED_CHUNK_SIZE = 1024 * 1024; // 1 MB

function getDispatchHttpUrl(): string {
  // replayWsServer is e.g. "wss://dispatch.replay.io"
  return replayWsServer.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

async function uploadRecordingWithoutPresignedUrls({
  accessToken,
  recordingId,
  recordingPath,
  size,
}: {
  accessToken: string;
  recordingId: string;
  recordingPath: string;
  size: number;
}): Promise<string> {
  const baseUrl = getDispatchHttpUrl();
  const userAgent = await getUserAgent();
  const { packageName } = await waitForPackageInfo();
  const fileBuffer = await readFile(recordingPath);
  const numChunks = Math.ceil(size / NO_PRESIGNED_CHUNK_SIZE);

  logDebug(`No-presigned upload: ${size} bytes in ${numChunks} chunk(s)`);

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/octet-stream",
    "User-Agent": userAgent,
    "X-Replay-Source": process.env.REPLAY_CLIENT_SOURCE || packageName,
  };

  if (numChunks <= 1) {
    // Small file: send everything directly to create-recording.
    const response = await fetch(`${baseUrl}/nut/create-recording`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-replay-recording-id": recordingId,
      },
      body: fileBuffer,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`create-recording failed: ${response.status} - ${text}`);
    }
    const json = (await response.json()) as { recordingId: string };
    return json.recordingId;
  }

  // Multi-chunk: send all but last chunk via partial-upload, last via create-recording.
  const lastChunkIndex = numChunks - 1;

  // First chunk establishes the uploadId.
  const firstChunk = fileBuffer.subarray(0, NO_PRESIGNED_CHUNK_SIZE);
  const firstResponse = await fetch(`${baseUrl}/nut/partial-upload`, {
    method: "POST",
    headers: authHeaders,
    body: firstChunk,
  });
  if (!firstResponse.ok) {
    const text = await firstResponse.text();
    throw new Error(`partial-upload (chunk 0) failed: ${firstResponse.status} - ${text}`);
  }
  const { uploadId } = (await firstResponse.json()) as { uploadId: string };

  logDebug(`No-presigned upload: chunk 0/${numChunks} uploaded, got uploadId ${uploadId}`);

  // Upload middle chunks sequentially.
  for (let i = 1; i < lastChunkIndex; i++) {
    const start = i * NO_PRESIGNED_CHUNK_SIZE;
    const end = Math.min(start + NO_PRESIGNED_CHUNK_SIZE, size);
    const chunk = fileBuffer.subarray(start, end);

    const resp = await fetch(`${baseUrl}/nut/partial-upload`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-replay-upload-id": uploadId,
        "x-replay-upload-index": i.toString(),
      },
      body: chunk,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`partial-upload (chunk ${i}) failed: ${resp.status} - ${text}`);
    }
    logDebug(`No-presigned upload: chunk ${i}/${numChunks} uploaded`);
  }

  // Final chunk goes to create-recording.
  const finalStart = lastChunkIndex * NO_PRESIGNED_CHUNK_SIZE;
  const finalChunk = fileBuffer.subarray(finalStart);

  const finalResponse = await fetch(`${baseUrl}/nut/create-recording`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "x-replay-upload-id": uploadId,
      "x-replay-recording-id": recordingId,
    },
    body: finalChunk,
  });
  if (!finalResponse.ok) {
    const text = await finalResponse.text();
    throw new Error(`create-recording failed: ${finalResponse.status} - ${text}`);
  }
  const json = (await finalResponse.json()) as { recordingId: string };

  logDebug(`No-presigned upload: chunk ${lastChunkIndex}/${numChunks} uploaded (final)`);
  logInfo("UploadRecording:NoPresigned:Succeeded", { recordingId: json.recordingId });
  return json.recordingId;
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

  const userAgent = await getUserAgent();
  const { packageName } = await waitForPackageInfo();

  try {
    const response = await Promise.race([
      fetch(url, {
        headers: {
          "Content-Length": size.toString(),
          "User-Agent": userAgent,
          Connection: "keep-alive",
          "X-Replay-Source": process.env.REPLAY_CLIENT_SOURCE || packageName,
        },
        method: "PUT",
        body: stream,
        duplex: "half",
        signal: abortSignal,
      }),
      streamError.promise,
    ]);

    logDebug("Fetch response received", { response });

    if (!response.ok) {
      const respText = await response.text();
      logDebug(`Fetch response text: ${respText}`);
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
