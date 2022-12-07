import * as readline from "node:readline";
import { existsSync, createReadStream } from "fs";
import path from "node:path";

import plugin, { getCypressReporter } from "../src/index";
import { TASK_NAME } from "../src/constants";

async function driver(
  callback: (type: string, value: any) => void,
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
        callback(json.type, json.value);
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

type EmitterCallback = ((...args: any[]) => void) | Record<string, (value: any) => any>;
const events: Record<string, EmitterCallback[]> = {};
const emitter = (name: string, cb: EmitterCallback) => {
  events[name] = events[name] || [];
  events[name].push(cb);
};

plugin(emitter as any, { version: "0.0.0", browsers: [] } as any);
driver(
  (type, value) => {
    let DateNow: any = undefined;
    switch (type) {
      case "spec:start":
        events["before:spec"]?.forEach(f => {
          if (typeof f === "function") {
            DateNow = Date.now;
            Date.now = () => value.startTime;
            f(value.spec);
            Date.now = DateNow;
          }
        });
        break;
      case "spec:end":
        events["after:spec"]?.forEach(f => {
          if (typeof f === "function") {
            f(value.spec, value.result);
          }
        });
        break;
      case "task":
        events[type]?.forEach(f => {
          if (typeof f === "function") {
            f("task", value);
          } else {
            f[TASK_NAME]?.(value);
          }
        });
        break;
    }
  },
  { delay: 0 }
).then(() => {
  console.log("done");
});
