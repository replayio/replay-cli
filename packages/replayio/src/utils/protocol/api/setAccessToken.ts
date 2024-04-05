import { setAccessTokenParameters, setAccessTokenResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";

export async function setAccessToken(client: ProtocolClient, params: setAccessTokenParameters) {
  return await client.sendCommand<setAccessTokenParameters, setAccessTokenResult>({
    method: "Authentication.setAccessToken",
    params,
  });
}
