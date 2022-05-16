import type { Struct } from "superstruct";
const {
  create,
  object,
  optional,
  string,
} = require("superstruct");

import { UnstructuredMetadata } from "./types";

const VERSION = 1;

const versions: Record<number, Struct> = {
  1: object({
    branch: optional(string()),
    commit: object({
      id: string(),
      title: optional(string()),
      url: optional(string())
    }),
    merge: optional(object({
      id: string(),
      title: string(),
      url: optional(string())
    })),
    provider: optional(string()),
    repository: optional(string()),
  }),
};

function validate(metadata: {source: UnstructuredMetadata}) {
  if (!metadata || !metadata.source) {
    throw new Error('Source metadata does not exist');
  }

  return init(metadata.source);
}

function init(data: UnstructuredMetadata) {
  const version = typeof data.version === "number" ? data.version : VERSION;
  if (versions[version]) {
    return {
      source: create(data, versions[version]),
    };
  } else {
    throw new Error(`Source metadata version ${data.version} not supported`);
  }
}

export {
  validate,
  init
};
