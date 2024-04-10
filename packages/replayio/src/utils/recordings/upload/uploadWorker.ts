import { createReadStream } from "fs";
import fetch from "node-fetch";
import { parentPort } from "worker_threads";
import { createLog } from "../../createLog";
import { getUserAgent } from "../../getUserAgent";
import { createHttpAgent } from "../../protocol/createHttpAgent";

if (parentPort === null) {
  throw new Error("Must be run as a worker");
}

parentPort.on(
  "message",
  async ({
    link,
    logPath,
    partMeta,
    size,
  }: {
    link: string;
    logPath: string;
    partMeta: { recordingPath: string; start: number; end: number };
    size: number;
  }) => {
    const { recordingPath, start, end } = partMeta;
    const debug = createLog("upload-worker", logPath);

    if (parentPort === null) {
      throw new Error("Must be run as a worker");
    }

    debug("Uploading chunk %o", { recordingPath, size, start, end });

    const stream = createReadStream(recordingPath, { start, end });
    const resp = await fetch(link, {
      agent: createHttpAgent({
        keepAlive: true,
      }),
      body: stream,
      headers: {
        Connection: "keep-alive",
        "Content-Length": size.toString(),
        "User-Agent": getUserAgent(),
      },
      method: "PUT",
    });

    debug(`Fetch response received. Status: ${resp.status}, Status Text: ${resp.statusText}`);

    if (resp.status !== 200) {
      const respText = await resp.text();
      debug(`Fetch response text: ${respText}`);
      throw new Error(`Failed to upload recording. Response was ${resp.status} ${resp.statusText}`);
    }

    const etag = resp.headers.get("etag");
    debug("Etag received %o", { etag, recordingPath, size, start, end });

    parentPort.postMessage(etag);
  }
);
