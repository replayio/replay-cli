import type { URL } from "url";
import type { AgentOptions } from "http";

import { parentPort } from "worker_threads";
import fs from "fs";
import fetch from "node-fetch";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { getUserAgent } from "./utils";
import dbg from "./debug";

const agentConfig: AgentOptions = {
  keepAlive: true,
  maxSockets: 500,
};
const agent = (parsedURL: URL) =>
  parsedURL.protocol == "http:" ? new HttpAgent(agentConfig) : new HttpsAgent(agentConfig);

if (parentPort === null) {
  throw new Error("Must be run as a worker");
}

parentPort.on(
  "message",
  async ({
    link,
    partMeta,
    size,
    logPath,
  }: {
    link: string;
    partMeta: { filePath: string; start: number; end: number };
    size: number;
    logPath: string;
  }) => {
    const { filePath, start, end } = partMeta;
    const debug = dbg("replay:cli:upload-worker", logPath);

    if (parentPort === null) {
      throw new Error("Must be run as a worker");
    }

    debug(`Uploading chunk size: ${size}`);

    const stream = fs.createReadStream(filePath, { start, end });
    const resp = await fetch(link, {
      method: "PUT",
      agent,
      headers: {
        Connection: "keep-alive",
        "Content-Length": size.toString(),
        "User-Agent": getUserAgent(),
      },
      body: stream,
    });

    debug(`Fetch response received. Status: ${resp.status}, Status Text: ${resp.statusText}`);

    if (resp.status !== 200) {
      const respText = await resp.text();
      debug(`Fetch response text: ${respText}`);
      throw new Error(`Failed to upload recording. Response was ${resp.status} ${resp.statusText}`);
    }

    const etag = resp.headers.get("etag");
    debug(`Etag received: ${etag}`);

    parentPort.postMessage(etag);
  }
);
