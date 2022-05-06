const { maybeLog } = require("../src/utils");
const test = require("./test");

// Each known metadata block should have a sanitizer that will check the contents before the upload
const handlers = {
  test: test.validate
};

const ALLOWED_KEYS = Object.keys(handlers);

// Sanitizing arbitrary recording metadata before uploading by removing any
// non-object values (allowing null) and limiting object values to known keys or
// userspace keys prefixed by `x-`.
function sanitize(metadata, opts = {}) {
  const updated = {};
  Object.keys(metadata).forEach((key) => {
    const value = metadata[key];
    // intentionally allowing `null` with the `typeof` check here
    if (typeof value === "object") {
      if (value === null || key.startsWith("x-")) {
        // passthrough null or userspace types
        updated[key] = value;
      } else if (ALLOWED_KEYS.includes(key)) {
        // validate known types
        Object.assign(updated, handlers[key](metadata));
      } else {
        // and warn when dropping all other types
        maybeLog(opts.verbose, `Ignoring metadata key "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`);
      }
    } else {
      maybeLog(opts.verbose, `Ignoring metadata key "${key}". Expected an object but received ${typeof value}`);
    }
  });

  return updated;
}

module.exports = {
  sanitize,
  test
};

