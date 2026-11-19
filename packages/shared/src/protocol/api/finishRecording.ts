import { finishRecordingParameters, finishRecordingResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function finishRecording(client: ProtocolClient, params: finishRecordingParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<finishRecordingParameters, finishRecordingResult>({
    method: "Internal.finishRecording",
    params,
  });
}
