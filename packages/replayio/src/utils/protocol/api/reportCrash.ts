import { reportCrashParameters, reportCrashResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient.js";

export async function reportCrash(client: ProtocolClient, params: reportCrashParameters) {
  await client.waitUntilAuthenticated();

  return await client.sendCommand<reportCrashParameters, reportCrashResult>({
    method: "Internal.reportCrash",
    params,
  });
}
