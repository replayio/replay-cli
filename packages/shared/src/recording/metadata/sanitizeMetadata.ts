import { logger } from "../../logger";
import { UnstructuredMetadata } from "../types";
import { validate as validateSource } from "./legacy/source";
import { validate as validateTest } from "./legacy/test";

export async function sanitizeMetadata(metadata: UnstructuredMetadata) {
  const updated: UnstructuredMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "object") {
      logger.debug(
        `Ignoring metadata key "${key}". Expected an object but received ${typeof value}`
      );
      continue;
    }

    if (value === null || key.startsWith("x-")) {
      updated[key] = value;
    } else {
      switch (key) {
        case "source": {
          try {
            const validated = await validateSource(value as UnstructuredMetadata);
            Object.assign(updated, validated);
          } catch (error) {
            logger.debug("Source validation failed", { error });
          }
          break;
        }
        case "test": {
          try {
            const validated = await validateTest(value as UnstructuredMetadata);
            Object.assign(updated, validated);
          } catch (error) {
            logger.debug("Test validation failed", { error });
          }
          break;
        }
        default: {
          logger.debug(
            `Ignoring metadata key "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`
          );
        }
      }
    }
  }

  return updated;
}
