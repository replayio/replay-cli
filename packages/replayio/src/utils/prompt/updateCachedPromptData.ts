import { readFromCache, writeToCache } from "@replay-cli/shared/cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

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
