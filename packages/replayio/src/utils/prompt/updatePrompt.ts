import { readFromCache, writeToCache } from "../cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

export function updatePrompt({ id, metadata }: { id: string; metadata: any }) {
  const cache = readFromCache<PromptHistory>(promptHistoryPath) ?? {};
  writeToCache<PromptHistory>(promptHistoryPath, {
    ...cache,
    [id]: {
      metadata,
      time: Date.now(),
    },
  });
}
