const {
  array,
  create,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
} = require("superstruct");

const VERSION = 1;

const versions = {
  1: object({
    version: defaulted(number(), () => 1),
    title: string(),
    result: enums(["passed", "failed", "timedOut"]),
    path: optional(array(string())),
    run: optional(string()),
    file: optional(string()),
  }),
};

function validate(metadata) {
  return init(metadata && metadata.test);
}

function init(data) {
  const version = data.version || VERSION;
  if (versions[version]) {
    return {
      test: create(data, versions[version]),
    };
  } else {
    throw new Error(`Test metadata version ${data.version} not supported`);
  }
}

module.exports = {
  validate,
  init
};
