import {
  endRecordingMultipartUploadParameters,
  endRecordingMultipartUploadResult,
} from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function endRecordingMultipartUpload(
  client: ProtocolClient,
  params: endRecordingMultipartUploadParameters
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<
    endRecordingMultipartUploadParameters,
    endRecordingMultipartUploadResult
  >({
    method: "Internal.endRecordingMultipartUpload",
    params,
  });
}
