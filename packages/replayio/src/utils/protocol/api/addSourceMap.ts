import { addSourceMapParameters, addSourceMapResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function addSourceMap(client: ProtocolClient, params: addSourceMapParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<addSourceMapParameters, addSourceMapResult>({
    method: "Recording.addSourceMap",
    params,
  });
}
