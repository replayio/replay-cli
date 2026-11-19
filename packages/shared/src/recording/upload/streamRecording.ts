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
import { uploadCrashedData } from "./uploadCrashData";
import { uploadRecording } from "./uploadRecording";
import { uploadSourceMaps } from "./uploadSourceMaps";
import { validateRecordingMetadata } from "./validateRecordingMetadata";

const pollInterval = 1_000;
const maxChunkSize = 4 * 1024 * 1024;

export type StreamRecordingOptions = {
  accessToken: string;
  // Aborted once the recorder process has exited
  recorderExited: AbortSignal;
};

// Uploads the recording while the recorder is still writing it.
// Falls back to a regular upload of the finished file if streaming fails.
export async function streamRecording(
  client: ProtocolClient,
  recording: LocalRecording,
  options: StreamRecordingOptions
) {
  logInfo("StreamRecording:Started", { recordingId: recording.id });

  try {
    await streamRecordingData(client, recording, options.recorderExited);
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
  recorderExited: AbortSignal
) {
  const { buildId, id, path } = recording;
  assert(path, "Recording path is required");

  const { recordingId } = await createRecording(client, {
    buildId,
    recordingId: id,
    requireFinish: true,
  });
  assert.equal(recordingId, id, "Server assigned a different recording ID");

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.uploadStarted,
    server: replayWsServer,
  });

  const file = await open(path, "r");
  try {
    let offset = 0;
    await followRecording(recording, recorderExited, async () => {
      offset = await sendAppendedData(client, recordingId, file, offset);
    });
  } finally {
    await file.close();
  }

  // Metadata (title, URL, duration) is only complete once the recording has ended
  await setRecordingMetadata(client, await validateRecordingMetadata(recording));
  await finishRecording(client, { recordingId });
}

// Refreshes the recording from the log and calls `onData` until the recorder has written its last byte.
// Unusable recordings end without reading further data.
async function followRecording(
  recording: LocalRecording,
  recorderExited: AbortSignal,
  onData: () => Promise<void>
) {
  while (true) {
    // Read before the log, so a status read after exit is final
    const exited = recorderExited.aborted;

    refreshRecording(recording);
    if (recording.recordingStatus === "unusable") {
      return;
    }

    await onData();

    if (recording.recordingStatus !== "recording") {
      return;
    }
    if (exited) {
      throw new Error("Recorder exited without finishing the recording");
    }

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
  offset: number
) {
  const { size } = await file.stat();

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
  { accessToken, recorderExited }: StreamRecordingOptions,
  streamError: Error
) {
  try {
    await followRecording(recording, recorderExited, async () => {});
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
        // The streamed recording ID is already taken on the server
        recording.id = randomUUID();
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
