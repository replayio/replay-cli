import type { Struct } from "superstruct";
import { envString, firstEnvValueOf } from "./env";
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
    file: optional(envString("RECORD_REPLAY_METADATA_TEST_FILE")),
    path: optional(array(string())),
    result: defaulted(
      enums(["passed", "failed", "timedOut"]),
      firstEnvValueOf("RECORD_REPLAY_METADATA_TEST_RESULT")
    ),
    run: optional(
      defaulted(
        object({
          id: defaulted(
            define("uuid", (v: any) => isUuid.v4(v)),
            firstEnvValueOf("RECORD_REPLAY_METADATA_TEST_RUN_ID", "RECORD_REPLAY_TEST_RUN_ID")
          ),
          title: optional(envString("RECORD_REPLAY_METADATA_TEST_RUN_TITLE")),
        }),
        {}
      )
    ),
    title: envString("RECORD_REPLAY_METADATA_TEST_TITLE"),
    version: defaulted(number(), () => 1),
  }),
};

function validate(metadata: { test: UnstructuredMetadata }) {
  if (!metadata || !metadata.test) {
    throw new Error("Test metadata does not exist");
  }

  return init(metadata.test);
}

function init(data: UnstructuredMetadata = {}) {
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
