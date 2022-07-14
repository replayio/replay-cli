import type { Struct } from "superstruct";
const {
  array,
  create,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
  define,
} = require("superstruct");
const isUuid = require("is-uuid");

import { UnstructuredMetadata } from "./types";

const VERSION = 1;

const versions: Record<number, Struct> = {
  1: object({
    file: optional(string()),
    path: optional(array(string())),
    result: enums(["passed", "failed", "timedOut"]),
    run: optional(
      object({
        id: define("uuid", (v: any) => isUuid.v4(v)),
        title: optional(string()),
      })
    ),
    title: string(),
    version: defaulted(number(), () => 1),
  }),
};

function validate(metadata: { test: UnstructuredMetadata }) {
  if (!metadata || !metadata.test) {
    throw new Error("Test metadata does not exist");
  }

  return init(metadata.test);
}

function init(data: UnstructuredMetadata) {
  const version = typeof data.version === "number" ? data.version : VERSION;
  if (versions[version]) {
    return {
      test: create(data, versions[version]),
    };
  } else {
    throw new Error(`Test metadata version ${data.version} not supported`);
  }
}

export { validate, init };
