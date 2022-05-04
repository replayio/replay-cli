const test = require("./test");

const handlers = {
  test
};

const ALLOWED_KEYS = Object.keys(handlers);
module.exports = function sanitize(metadata) {
  const updated = {};
  Object.keys(metadata).forEach((key) => {
    const value = metadata[key];
    // intentionally allowing `null` with the `typeof` check here
    if (typeof value === "object") {
      if (!value || key.startsWith("x-")) {
        updated[key] = value;
      } else if (ALLOWED_KEYS.includes(key)) {
        updated[key] = handlers[key](value);
      }
    }
  });

  return updated;
}