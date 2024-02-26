import type { URL } from "url";
import type { AgentOptions } from "http";

import { parentPort } from "worker_threads";
import fetch from "node-fetch";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { getUserAgent } from "./utils";

// TODO: Swap out console.log with DEBUG logs, but it's worker thread
// and current dbg log implementation will race parent thread and worker thread

const agentConfig: AgentOptions = {
  keepAlive: true,
  maxSockets: 500,
};
const agent = (parsedURL: URL) =>
  parsedURL.protocol == "http:" ? new HttpAgent(agentConfig) : new HttpsAgent(agentConfig);

if (parentPort === null) {
  throw new Error("Must be run as a worker");
}

parentPort.on("message", async ({ link, part, size }) => {
  if (parentPort === null) {
    throw new Error("Must be run as a worker");
  }

  console.log(`Uploading chunk size: ${size}`);

  const resp = await fetch(link, {
    //@ts-expect-error highWaterMark options is only in node js
    highWaterMark: 1024 * 1024, // 1MB, Node.js has just 16kb by default
    method: "PUT",
    agent,
    headers: {
      Connection: "keep-alive",
      "Content-Length": size.toString(),
      "User-Agent": getUserAgent(),
    },
    body: part,
  });

  console.log(`Fetch response received. Status: ${resp.status}, Status Text: ${resp.statusText}`);

  if (resp.status !== 200) {
    const respText = await resp.text();
    console.log(`Fetch response text: ${respText}`);
    throw new Error(`Failed to upload recording. Response was ${resp.status} ${resp.statusText}`);
  }

  const etag = resp.headers.get("etag");
  console.log(`Etag received: ${etag}`);

  parentPort.postMessage(etag);
});
