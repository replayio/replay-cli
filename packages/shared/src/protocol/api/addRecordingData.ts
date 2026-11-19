import { addRecordingDataParameters, addRecordingDataResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function addRecordingData(
  client: ProtocolClient,
  params: addRecordingDataParameters,
  data: Buffer
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<addRecordingDataParameters, addRecordingDataResult>({
    binary: data,
    method: "Internal.addRecordingData",
    params,
  });
}
