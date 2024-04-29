import {
  beginRecordingMultipartUploadParameters,
  beginRecordingMultipartUploadResult,
} from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function beginRecordingMultipartUpload(
  client: ProtocolClient,
  {
    maxChunkSize,
    ...params
  }: Omit<beginRecordingMultipartUploadParameters, "chunkSize"> & {
    maxChunkSize?: number;
  }
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<
    beginRecordingMultipartUploadParameters,
    beginRecordingMultipartUploadResult
  >({
    method: "Internal.beginRecordingMultipartUpload",
    params: {
      ...params,
      chunkSize: maxChunkSize,
    },
  });
}
