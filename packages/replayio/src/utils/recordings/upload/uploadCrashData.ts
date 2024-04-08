import { replayServer } from "../../../config";
import ProtocolClient from "../../protocol/ProtocolClient";
import { reportCrash } from "../../protocol/api/reportCrash";
import { debug } from "../debug";
import { LocalRecording, RECORDING_LOG_KIND } from "../types";
import { updateRecordingLog } from "../updateRecordingLog";

export async function uploadCrashedData(client: ProtocolClient, recording: LocalRecording) {
  debug(`Uploading crash data for ${recording.id}`);

  const crashData = recording.crashData?.slice() ?? [];
  crashData.push({
    kind: "recordingMetadata",
    recordingId: recording.id,
  });

  await Promise.all(crashData.map(async data => reportCrash(client, data)));

  updateRecordingLog(recording, {
    kind: RECORDING_LOG_KIND.crashUploaded,
    server: replayServer,
  });

  recording.uploadStatus = "uploaded";
}
