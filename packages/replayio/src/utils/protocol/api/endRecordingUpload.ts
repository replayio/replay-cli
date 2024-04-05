import { endRecordingUploadParameters, endRecordingUploadResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function endRecordingUpload(
  client: ProtocolClient,
  params: endRecordingUploadParameters
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<endRecordingUploadParameters, endRecordingUploadResult>({
    method: "Internal.endRecordingUpload",
    params,
  });
}
