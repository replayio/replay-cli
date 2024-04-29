import { beginRecordingUploadParameters, beginRecordingUploadResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function beginRecordingUpload(
  client: ProtocolClient,
  params: beginRecordingUploadParameters
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<beginRecordingUploadParameters, beginRecordingUploadResult>({
    method: "Internal.beginRecordingUpload",
    params,
  });
}
