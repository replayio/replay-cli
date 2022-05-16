import { Options } from "../src/types";
import { maybeLog } from "../src/utils";

import * as test from "./test";
import * as source from "./source";
import { UnstructuredMetadata } from "./types";

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
function sanitize(metadata: UnstructuredMetadata, opts: Options = {}) {
  const updated: UnstructuredMetadata = {};
  Object.keys(metadata).forEach((key) => {
    const value = metadata[key];

    if (typeof value !== "object") {
      maybeLog(
        opts.verbose,
        `Ignoring metadata key "${key}". Expected an object but received ${typeof value}`
      );
      return;
    }

    if (value === null || key.startsWith("x-")) {
      // passthrough null or userspace types
      updated[key] = value;
    } else if (isAllowedKey(key)) {
      // validate known types
      Object.assign(updated, handlers[key](metadata as any));
    } else {
      // and warn when dropping all other types
      maybeLog(
        opts.verbose,
        `Ignoring metadata key "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`
      );
    }
  });

  return updated;
}

export { sanitize, test };
