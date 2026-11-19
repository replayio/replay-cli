import { FileHandle, open } from "fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { timeoutAfter } from "../../async/timeoutAfter";
import { replayWsServer } from "../../config";
import { logError, logInfo } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { addRecordingData } from "../../protocol/api/addRecordingData";
import { createRecording } from "../../protocol/api/createRecording";
import { finishRecording } from "../../protocol/api/finishRecording";
import { setRecordingMetadata } from "../../protocol/api/setRecordingMetadata";
import { readRecordings } from "../getRecordings";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";
import { isOpenForWriting } from "./recordingWriter";
import { uploadCrashedData } from "./uploadCrashData";
import { uploadRecording } from "./uploadRecording";
import { uploadSourceMaps } from "./uploadSourceMaps";
import { validateRecordingMetadata } from "./validateRecordingMetadata";

const pollInterval = 1_000;
const maxChunkSize = 4 * 1024 * 1024;

export type StreamRecordingOptions = {
  accessToken: string;
  // Once aborted, the recording is finished with the data written so far
  finish?: AbortSignal;
};

// Uploads the recording while the recorder is still writing it.
// Falls back to a regular upload of the file if streaming fails.
export async function streamRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: StreamRecordingOptions
) {
  logInfo("StreamRecording:Started", { recordingId: recording.id });

  try {
    await streamRecordingData(client, recording, options.finish);
  } catch (error) {
    logError("StreamRecording:Failed", { error, recordingId: recording.id });
    await uploadAfterStreamFailure(recording, options, error as Error);
    return;
  }

  if (recording.metadata.sourceMaps.length) {
    await uploadSourceMaps(client, recording);
  }

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFinished,
    server: replayWsServer,
  });
  recording.uploadStatus = "uploaded";

  if (recording.recordingStatus === "crashed") {
    await uploadCrashedData(client, recording);
  }

  logInfo("StreamRecording:Succeeded", { recordingId: recording.id });
}

async function streamRecordingData(
  client: ProtocolClient,
  recording: LocalRecording,
  finish: AbortSignal | undefined
) {
  const { path } = recording;
  assert(path, "Recording path is required");

  // Created with the first data, so recordings that never send any don't create one
  let recordingId: string | undefined;
  let offset = 0;
  const file = await open(path, "r");
  try {
    await followRecording(recording, finish, async () => {
      const { size } = await file.stat();
      if (size > offset) {
        recordingId ??= await createStreamedRecording(client, recording);
        offset = await sendAppendedData(client, recordingId, file, offset, size);
      }
    });
  } finally {
    await file.close();
  }

  if (!recordingId) {
    throw new Error(`Recording ended (${recording.recordingStatus}) before any data was sent`);
  }

  // Metadata (title, URL, duration) is only complete once the recording has ended
  await setRecordingMetadata(client, await validateRecordingMetadata(recording));
  await finishRecording(client, { recordingId });
}

async function createStreamedRecording(client: ProtocolClient, recording: LocalRecording) {
  const { buildId, serverId } = recording;

  // Left unfinished, the server discards it once the connection closes
  const { recordingId } = await createRecording(client, {
    buildId,
    recordingId: serverId,
    requireFinish: true,
  });
  assert.equal(recordingId, serverId, "Server assigned a different recording ID");

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadStarted,
    server: replayWsServer,
  });

  return recordingId;
}

// Refreshes the recording from the log and calls `onData` until the recorder has written its
// last byte or `finish` is aborted. Unusable recordings end without reading further data.
// Throws if the recorder is gone without having ended the recording.
async function followRecording(
  recording: LocalRecording,
  finish: AbortSignal | undefined,
  onData: () => Promise<void>
) {
  const { path } = recording;
  assert(path, "Recording path is required");

  // The recorder closes the file right before it logs `writeFinished`, so a closed file
  // only means the recorder is gone if the log still says "recording" one poll later.
  let closedAtLastPoll = false;

  while (true) {
    // Both are read before the log, so the log read is at least as recent
    const finishing = !!finish?.aborted;
    const writing = await isOpenForWriting(path);

    refreshRecording(recording);
    if (recording.recordingStatus === "unusable") {
      return;
    }

    const ended = recording.recordingStatus !== "recording";
    if (writing || ended || finishing) {
      await onData();
    }
    if (ended || finishing) {
      return;
    }

    if (!writing && closedAtLastPoll) {
      throw new Error("Recorder is gone without having finished the recording");
    }
    closedAtLastPoll = !writing;

    await timeoutAfter(pollInterval);
  }
}

function refreshRecording(recording: LocalRecording) {
  const current = readRecordings().find(({ id }) => id === recording.id);
  assert(current, `Recording ${recording.id} not found in the recording log`);

  Object.assign(recording, current);
}

async function sendAppendedData(
  client: ProtocolClient,
  recordingId: string,
  file: FileHandle,
  offset: number,
  size: number
) {
  while (offset < size) {
    const length = Math.min(size - offset, maxChunkSize);
    const data = Buffer.alloc(length);
    const { bytesRead } = await file.read(data, 0, length, offset);
    assert.equal(bytesRead, length, "Short read from recording file");

    await addRecordingData(client, { recordingId, offset, length }, data);
    offset += length;
  }

  return offset;
}

async function uploadAfterStreamFailure(
  recording: LocalRecording,
  { accessToken, finish }: StreamRecordingOptions,
  streamError: Error
) {
  try {
    await followRecording(recording, finish, async () => {});
  } catch (error) {
    markUploadFailed(recording, error as Error);
    throw error;
  }

  const client = new ProtocolClient(accessToken);
  try {
    switch (recording.recordingStatus) {
      case "crashed":
        await uploadCrashedData(client, recording);
        break;
      case "finished":
      // Only once `finish` was aborted; uploaded as written so far
      case "recording":
        // The streamed upload may already hold the ID on the server
        recording.serverId = randomUUID();
        await uploadRecording(client, recording, {
          accessToken,
          multiPartUpload: true,
          processingBehavior: "do-not-process",
        });
        break;
      default:
        markUploadFailed(recording, streamError);
        throw streamError;
    }
  } finally {
    client.close();
  }
}

function markUploadFailed(recording: LocalRecording, error: Error) {
  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadFailed,
  });
  recording.uploadStatus = "failed";
  recording.uploadError = error;
}
