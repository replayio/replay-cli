import type { AgentOptions } from "http";

import { parentPort } from "worker_threads";
import fs from "fs";
import fetch from "node-fetch";
import { getHttpAgent, getUserAgent } from "./utils";
import { ExtandableDebug } from "@replayio/dumpable-debug";

export type UploadWorkerMessage =
  | {
      type: "log";
      args: Parameters<ExtandableDebug>;
    }
  | {
      type: "result";
      value: string;
    };

if (parentPort === null) {
  throw new Error("Must be run as a worker");
}

const port = parentPort;

function postMessage(message: UploadWorkerMessage) {
  port.postMessage(message);
}
function debug(...args: Parameters<ExtandableDebug>) {
  postMessage({
    type: "log",
    args,
  });
}

port.on(
  "message",
  async ({
    link,
    partMeta,
    size,
    agentOptions,
  }: {
    link: string;
    partMeta: { filePath: string; start: number; end: number };
    size: number;
    agentOptions?: AgentOptions;
  }) => {
    const { filePath, start, end } = partMeta;

    debug("Uploading chunk %o", { filePath, size, start, end });

    const stream = fs.createReadStream(filePath, { start, end });
    const resp = await fetch(link, {
      method: "PUT",
      agent: getHttpAgent(link, {
        keepAlive: true,
        ...agentOptions,
      }),
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
    debug("Etag received %o", { etag, filePath, size, start, end });

    if (!etag) {
      throw new Error("Etag not found in response headers");
    }

    postMessage({
      type: "result",
      value: etag,
    });
  }
);
