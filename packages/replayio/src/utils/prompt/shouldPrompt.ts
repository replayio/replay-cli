import { readFromCache } from "../cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

const ONE_DAY = 1000 * 60 * 60 * 24;

export function shouldPrompt(id: string, minimumIntervalMs: number = ONE_DAY) {
  const cache = readFromCache<PromptHistory>(promptHistoryPath);
  if (!cache) {
    return true;
  }

  const lastPromptTime = cache[id];
  return lastPromptTime == null || Date.now() - lastPromptTime >= minimumIntervalMs;
}
