import * as readline from "node:readline";
import { existsSync, createReadStream } from "fs";
import WebSocket from "ws";
import path from "node:path";

import plugin, { getCypressReporter } from "../src/index";
import { CONNECT_TASK_NAME } from "../src/constants";

async function driver(
  callback: (type: string, value: any) => Promise<void>,
  {
    file = path.resolve(__dirname, "./fixtures/fixture.log"),
    delay = 100,
  }: { file?: string; delay?: number } = {}
) {
  if (existsSync(file)) {
    const f = createReadStream(file);
    const rl = readline.createInterface({
      input: f,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        const json = JSON.parse(line);
        await callback(json.type, json.value);
      } catch (e) {
        console.error("Error parsing JSON");
        console.error(e);
      }

      if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } else {
    console.error(`${file} does not exist`);
    process.exit(1);
  }
}

type EmitterCallback = ((...args: any[]) => Promise<void>) | Record<string, (value: any) => any>;
const events: Record<string, EmitterCallback[]> = {};
const emitter = (name: string, cb: EmitterCallback) => {
  events[name] = events[name] || [];
  events[name].push(cb);
};

plugin(emitter as any, { version: "0.0.0", browsers: [], env: {} } as any);

const connector = events["task"][0];
if (typeof connector === "function") {
  console.error("Unexpected task listener");
  process.exit(1);
}

(async () => {
  const { port } = await (connector[CONNECT_TASK_NAME](undefined) as Promise<{ port: number }>);

  const ws = new WebSocket(`ws://0.0.0.0:${port}`);
  await new Promise(resolve => {
    ws.onopen = resolve;
  });

  await driver(
    async (type, value) => {
      let DateNow: any = undefined;
      switch (type) {
        case "spec:start":
          events["before:spec"]?.forEach(f => {
            if (typeof f !== "function") return;

            // monkey-patch the "current time" from the spec:start msg into
            // Date.now() and restore it after the fact
            DateNow = Date.now;
            Date.now = () => value.startTime;
            f(value.spec);
            Date.now = DateNow;
          });
          break;
        case "spec:end":
          for (const f of events["after:spec"]) {
            if (typeof f !== "function") return;
            await f(value.spec, value.result);
          }
          break;
        case "task":
          ws.send(JSON.stringify({ events: [value] }));
          break;
      }
    },
    { delay: 0, file: process.argv[2] }
  );

  console.log("done");
  ws.close();
  process.exit(0);
})();
