import { addOriginalSourceParameters, addOriginalSourceResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function addOriginalSource(
  client: ProtocolClient,
  params: addOriginalSourceParameters
) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<addOriginalSourceParameters, addOriginalSourceResult>({
    method: "Recording.addOriginalSource",
    params,
  });
}
