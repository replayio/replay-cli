import { createRecordingParameters, createRecordingResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function createRecording(client: ProtocolClient, params: createRecordingParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<createRecordingParameters, createRecordingResult>({
    method: "Internal.createRecording",
    params,
  });
}
