import { readFromCache, writeToCache } from "../cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

export async function prompt(id?: string): Promise<boolean> {
  return new Promise(resolve => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function onData(data: string) {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.setEncoding();

      if (id) {
        const cache = readFromCache<PromptHistory>(promptHistoryPath) ?? {};
        writeToCache<PromptHistory>(promptHistoryPath, {
          ...cache,
          [id]: Date.now(),
        });
      }

      switch (data) {
        case "\r":
          resolve(true);
          break;
        default:
          resolve(false);
          break;
      }
    }

    stdin.on("data", onData);
  });
}
