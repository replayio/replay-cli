import { replayWsServer } from "../../config";
import { logger } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { reportCrash } from "../../protocol/api/reportCrash";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";

export async function uploadCrashedData(client: ProtocolClient, recording: LocalRecording) {
  logger.debug("Uploading crash data for recording", { recording });

  const crashData = recording.crashData?.slice() ?? [];
  crashData.push({
    kind: "recordingMetadata",
    recordingId: recording.id,
  });

  await Promise.all(crashData.map(async data => reportCrash(client, { data })));

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.crashUploaded,
    server: replayWsServer,
  });

  recording.uploadStatus = "uploaded";
}
