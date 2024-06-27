import { releaseSessionParameters, releaseSessionResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function releaseSession(client: ProtocolClient, params: releaseSessionParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<releaseSessionParameters, releaseSessionResult>({
    method: "Recording.releaseSession",
    params,
  });
}
