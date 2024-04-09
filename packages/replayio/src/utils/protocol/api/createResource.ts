import { createParameters, createResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function createResource(client: ProtocolClient, params: createParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<createParameters, createResult>({
    method: "Resource.create",
    params,
  });
}
