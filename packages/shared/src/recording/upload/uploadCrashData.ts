import { replayWsServer } from "../../config";
import { logError, logInfo } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { reportCrash } from "../../protocol/api/reportCrash";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";

export async function uploadCrashedData(client: ProtocolClient, recording: LocalRecording) {
  logInfo("UploadCrashedData:Started", { recordingId: recording.id });

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

    logInfo("UploadCrashedData:Succeeded", { recording: recording.id });
    recording.uploadStatus = "uploaded";
  } catch (error) {
    logError("UploadCrashedData:Failed", {
      error,
      recordingId: recording.id,
      buildId: recording.buildId,
    });
    recording.uploadStatus = "failed";
    recording.uploadError = error as Error;
  }
}
