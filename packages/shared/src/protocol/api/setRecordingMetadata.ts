import { setRecordingMetadataParameters, setRecordingMetadataResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function setRecordingMetadata(
  client: ProtocolClient,
  params: setRecordingMetadataParameters
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<setRecordingMetadataParameters, setRecordingMetadataResult>({
    method: "Internal.setRecordingMetadata",
    params,
  });
}
