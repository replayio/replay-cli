import { replayWsServer } from "../../config";
import { logger } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { reportCrash } from "../../protocol/api/reportCrash";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";

export async function uploadCrashedData(client: ProtocolClient, recording: LocalRecording) {
  logger.info("UploadCrashedData:Started", { recordingId: recording.id });

  const crashData = recording.crashData?.slice() ?? [];
  crashData.push({
    kind: "recordingMetadata",
    recordingId: recording.id,
  });

  try {
    await Promise.all(crashData.map(async data => reportCrash(client, { data })));

    updateRecordingLog(recording, {
      kind: RECORDING_LOG_KIND.crashUploaded,
      server: replayWsServer,
    });

    recording.uploadStatus = "uploaded";
  } catch (error) {
    recording.uploadStatus = "failed";
    recording.uploadError = error as Error;
  }
}
