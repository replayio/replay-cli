import { existsParameters, existsResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function checkIfResourceExists(client: ProtocolClient, params: existsParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<existsParameters, existsResult>({
    method: "Resource.exists",
    params,
  });
}
