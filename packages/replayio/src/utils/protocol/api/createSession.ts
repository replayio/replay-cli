import { createSessionParameters, createSessionResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function createSession(client: ProtocolClient, params: createSessionParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<createSessionParameters, createSessionResult>({
    method: "Recording.createSession",
    params,
  });
}
