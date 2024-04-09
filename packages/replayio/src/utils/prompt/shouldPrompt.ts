import { readFromCache } from "../cache";
import { promptHistoryPath } from "./config";
import { PromptHistory } from "./types";

const ONE_DAY = 1000 * 60 * 60 * 24;

export function shouldPrompt({
  id,
  metadata: metadataNext,
  minimumIntervalMs = ONE_DAY,
}: {
  id: string;
  metadata: any;
  minimumIntervalMs?: number;
}) {
  const cache = readFromCache<PromptHistory>(promptHistoryPath);
  if (!cache) {
    return true;
  }

  const entry = cache[id];
  if (entry == null || typeof entry !== "object") {
    return true;
  }

  const { metadata: metadataPrev, time } = entry;
  if (Date.now() - time >= minimumIntervalMs) {
    return true;
  }

  if (metadataNext !== metadataPrev) {
    return true;
  }

  return false;
}
