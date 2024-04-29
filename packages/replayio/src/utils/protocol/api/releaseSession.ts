import { releaseSessionParameters, releaseSessionResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function releaseSession(client: ProtocolClient, params: releaseSessionParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<releaseSessionParameters, releaseSessionResult>({
    method: "Recording.releaseSession",
    params,
  });
}
