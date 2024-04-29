import { readFromCache, writeToCache } from "../cache.js";
import { promptHistoryPath } from "./config.js";
import { PromptHistory } from "./types.js";

export function updateCachedPromptData({ id, metadata }: { id: string; metadata: any }) {
  const cache = readFromCache<PromptHistory>(promptHistoryPath) ?? {};
  writeToCache<PromptHistory>(promptHistoryPath, {
    ...cache,
    [id]: {
      metadata,
      time: Date.now(),
    },
  });
}
