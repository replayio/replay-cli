import { logDebug, logInfo } from "../../logger";
import { UnstructuredMetadata } from "../types";
import { validate as validateSource } from "./legacy/source";
import { validate as validateTest } from "./legacy/test";

type Options = {
  verbose?: boolean;
};

export async function sanitizeMetadata(metadata: UnstructuredMetadata, opts: Options = {}) {
  const updated: UnstructuredMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "object") {
      if (opts.verbose) {
        console.log(
          `Ignoring metadata key "${key}". Expected an object but received ${typeof value}`
        );
      }
      logInfo("SanitizeMetadata:UnexpectedKeyType", { key, keyType: typeof value });
      continue;
    }

    if (value === null || key.startsWith("x-")) {
      updated[key] = value;
    } else {
      switch (key) {
        case "source": {
          try {
            const validated = await validateSource(value as UnstructuredMetadata | undefined);
            Object.assign(updated, validated);
          } catch (error) {
            logDebug("Source validation failed", { error });
          }
          break;
        }
        case "test": {
          try {
            const validated = await validateTest(value as UnstructuredMetadata | undefined);
            Object.assign(updated, validated);
          } catch (error) {
            logDebug("Test validation failed", { error });
          }
          break;
        }
        default: {
          if (opts.verbose) {
            console.log(
              `Ignoring metadata key "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`
            );
          }
          logInfo("SanitizeMetadata:IgnoringKey", { key });
        }
      }
    }
  }

  filterNodeModulesStacks(updated);

  return updated;
}

function filterNodeModulesStacks(metadata: UnstructuredMetadata) {
  const playwright = metadata["x-replay-playwright"] as
    | { stacks?: Record<string, Array<{ file?: string }>> }
    | undefined;
  if (!playwright?.stacks) {
    return;
  }

  const removedIds = new Set<string>();
  for (const [key, frames] of Object.entries(playwright.stacks)) {
    if (frames.every(frame => frame.file?.includes("node_modules"))) {
      delete playwright.stacks[key];
      removedIds.add(key);
    }
  }

  if (removedIds.size === 0) {
    return;
  }

  const test = metadata["test"] as
    | { tests?: Array<{ events?: Record<string, Array<{ data?: { id?: string } }>> }> }
    | undefined;
  if (!test?.tests) {
    return;
  }

  for (const entry of test.tests) {
    if (!entry.events) {
      continue;
    }
    for (const phase of Object.keys(entry.events)) {
      const events = entry.events[phase];
      if (Array.isArray(events)) {
        entry.events[phase] = events.filter(e => !removedIds.has(e.data?.id ?? ""));
      }
    }
  }
}
