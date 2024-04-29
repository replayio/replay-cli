import { replayWsServer } from "../../../config.js";
import ProtocolClient from "../../protocol/ProtocolClient.js";
import { reportCrash } from "../../protocol/api/reportCrash.js";
import { debug } from "../debug.js";
import { LocalRecording, RECORDING_LOG_KIND } from "../types.js";
import { updateRecordingLog } from "../updateRecordingLog.js";

export async function uploadCrashedData(client: ProtocolClient, recording: LocalRecording) {
  debug(`Uploading crash data for ${recording.id}`);

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
