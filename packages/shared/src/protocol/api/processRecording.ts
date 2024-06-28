import { processRecordingParameters, processRecordingResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function processRecording(client: ProtocolClient, params: processRecordingParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<processRecordingParameters, processRecordingResult>({
    method: "Recording.processRecording",
    params,
  });
}
