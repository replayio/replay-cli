import { appendFileSync } from "fs";
import path from "path";

import { Options, UnstructuredMetadata } from "../types";
import { getDirectory, maybeLog } from "../utils";

import * as test from "./test";
import * as source from "./source";

// Each known metadata block should have a sanitizer that will check the contents before the upload
const handlers = {
  test: test.validate,
  source: source.validate,
};

type AllowedKey = keyof typeof handlers;
const ALLOWED_KEYS = Object.keys(handlers);

function isAllowedKey(key: string): key is AllowedKey {
  return ALLOWED_KEYS.includes(key);
}

// Sanitizing arbitrary recording metadata before uploading by removing any
// non-object values (allowing null) and limiting object values to known keys or
// userspace keys prefixed by `x-`.
async function sanitize(metadata: UnstructuredMetadata, opts: Options = {}) {
  const updated: UnstructuredMetadata = {};
  for (const key of Object.keys(metadata)) {
    const value = metadata[key];

    if (typeof value !== "object") {
      maybeLog(
        opts.verbose,
        `Ignoring metadata key "${key}". Expected an object but received ${typeof value}`
      );

      continue;
    }

    if (value === null || key.startsWith("x-")) {
      // passthrough null or userspace types
      updated[key] = value;
    } else if (isAllowedKey(key)) {
      // validate known types
      const validated = await handlers[key](metadata as any);
      Object.assign(updated, validated);
    } else {
      // and warn when dropping all other types
      maybeLog(
        opts.verbose,
        `Ignoring metadata key "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`
      );
    }
  }

  return updated;
}

/**
 * Adds unstructured metadata to the local recordings database.
 *
 * New metadata will be merged with existing data. If the same key is used by
 * multiple entries, the most recent entry's value will be used.
 *
 * Metadata is not validated until the recording is uploaded so arbitrary keys
 * may be used here to manage recordings before upload.
 *
 * @param recordingId UUID of the recording
 * @param metadata Recording metadata
 */
function add(recordingId: string, metadata: UnstructuredMetadata) {
  const entry = {
    id: recordingId,
    kind: "addMetadata",
    metadata,
    timestamp: Date.now(),
  };

  appendFileSync(path.join(getDirectory(), "recordings.log"), `\n${JSON.stringify(entry)}\n`);
}

export { add, sanitize, source, test };
