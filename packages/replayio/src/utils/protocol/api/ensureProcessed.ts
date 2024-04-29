import { ensureProcessedParameters, ensureProcessedResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function ensureProcessed(client: ProtocolClient, sessionId: string) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<ensureProcessedParameters, ensureProcessedResult>({
    method: "Session.ensureProcessed",
    params: {},
    sessionId,
  });
}
