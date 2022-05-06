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
    file: optional(string()),
    path: optional(array(string())),
    result: enums(["passed", "failed", "timedOut"]),
    run: optional(string()),
    title: string(),
    version: defaulted(number(), () => 1),
  }),
};

function validate(metadata) {
  if (!metadata || !metadata.test) {
    throw new Error('Test metadata does not exist');
  }

  return init(metadata.test);
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
