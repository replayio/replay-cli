const test = require("./test");

// Each known metadata block should have a sanitizer that will check the contents before the upload
const handlers = {
  test
};

const ALLOWED_KEYS = Object.keys(handlers);

// Sanitizing arbitrary recording metadata before uploading by removing any
// non-object values (allowing null) and limiting object values to known keys or
// userspace keys prefixed by `x-`.
function sanitize(metadata) {
  const updated = {};
  Object.keys(metadata).forEach((key) => {
    const value = metadata[key];
    // intentionally allowing `null` with the `typeof` check here
    if (typeof value === "object") {
      if (!value || key.startsWith("x-")) {
        updated[key] = value;
      } else if (ALLOWED_KEYS.includes(key)) {
        Object.assign(updated, handlers[key](metadata));
      } else {
        console.warn(`Ignoring "${key}". Custom metadata blocks must be prefixed by "x-". Try "x-${key}" instead.`);
      }
    } else {
      console.warn(`Ignoring "${key}". Expected an object but received ${typeof value}`);
    }
  });

  return updated;
}

module.exports = {
  sanitize,
  ...handlers
};

