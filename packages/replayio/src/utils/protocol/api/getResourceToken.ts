import { tokenParameters, tokenResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function getResourceToken(client: ProtocolClient, params: tokenParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<tokenParameters, tokenResult>({
    method: "Resource.token",
    params,
  });
}
