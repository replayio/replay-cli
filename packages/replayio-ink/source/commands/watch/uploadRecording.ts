import { ProtocolClient, uploadRecording as uploadRecordingExternal } from "replayio";
import { Recording } from "./types.js";

const client = new ProtocolClient();

export async function uploadRecording(recording: Recording) {
  await client.waitUntilAuthenticated();
  await uploadRecordingExternal(client, recording.localRecording, {
    multiPartUpload: true,
    processingBehavior: "start-processing",
  });
}
