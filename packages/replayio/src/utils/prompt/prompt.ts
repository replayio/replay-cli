import { readFromCache, writeToCache } from "../cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

export async function prompt({
  abortSignal,
  id,
}: {
  abortSignal?: AbortSignal;
  id?: string;
} = {}): Promise<boolean> {
  return new Promise(resolve => {
    const stdin = process.stdin;
    const prevRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function destroy() {
      stdin.off("data", onData);
      stdin.setRawMode(prevRaw);
      stdin.setEncoding();

      if (abortSignal) {
        abortSignal.removeEventListener("abort", destroy);
      }
    }

    function onData(data: string) {
      destroy();

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

    // TODO [PRO-*] Verify that exit signals are properly handled while this listener is attached
    // github.com/replayio/replay-cli/pull/344#discussion_r1553358859
    stdin.on("data", onData);

    if (abortSignal) {
      abortSignal.addEventListener("abort", destroy);
    }
  });
}
