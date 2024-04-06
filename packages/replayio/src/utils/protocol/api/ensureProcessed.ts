import { ensureProcessedParameters, ensureProcessedResult } from "@replayio/protocol";
import ProtocolClient from "../ProtocolClient";
import { debug } from "../debug";

export async function ensureProcessed(client: ProtocolClient, sessionId: string) {
  await client.waitUntilAuthenticated();

  let removeListeners: Function[] = [];

  return new Promise<void>(async (resolve, reject) => {
    try {
      removeListeners.push(
        client.listenForMessage("Recording.sessionError", (error: any) => {
          reject(error);
        })
      );

      removeListeners.push(
        client.listenForMessage("Session.processingProgress", ({ progressPercent }) => {
          debug(`Processing at ${progressPercent}% for session ${sessionId}`);
        })
      );

      debug(`Processing recording for session ${sessionId}`);

      await client.sendCommand<ensureProcessedParameters, ensureProcessedResult>({
        method: "Session.ensureProcessed",
        params: {},
        sessionId,
      });

      resolve();
    } catch (error) {
      reject(error);
    } finally {
      removeListeners.forEach(removeListener => removeListener());
    }
  });
}
