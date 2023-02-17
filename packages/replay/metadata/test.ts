import {
  array,
  create,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
  define,
  Struct,
  any,
} from "superstruct";
const isUuid = require("is-uuid");

import { UnstructuredMetadata } from "../src/types";
import { envString, firstEnvValueOf } from "./env";

const VERSION = 1;

const versions: Record<number, Struct<any, any>> = {
  1: object({
    suite: optional(envString("RECORD_REPLAY_METADATA_TEST_SUITE")),
    file: optional(envString("RECORD_REPLAY_METADATA_TEST_FILE")),
    title: envString("RECORD_REPLAY_METADATA_TEST_TITLE"),
    path: optional(array(string())),
    result: defaulted(
      enums(["passed", "failed", "timedOut"]),
      firstEnvValueOf("RECORD_REPLAY_METADATA_TEST_RESULT")
    ),
    tests: optional(
      array(
        object({
          id: optional(string()),
          parentId: optional(string()),
          title: string(),
          path: optional(array(string())),
          relativePath: optional(string()),
          result: enums(["passed", "failed", "timedOut", "skipped", "unknown"]),
          error: optional(
            object({
              message: string(),
              line: optional(number()),
              column: optional(number()),
            })
          ),
          relativeStartTime: optional(number()),
          duration: optional(number()),
          steps: optional(array(any())),
        })
      )
    ),
    runner: optional(
      defaulted(
        object({
          name: optional(envString("RECORD_REPLAY_METADATA_TEST_RUNNER_NAME")),
          version: optional(envString("RECORD_REPLAY_METADATA_TEST_RUNNER_VERSION")),
          plugin: optional(envString("RECORD_REPLAY_METADATA_TEST_RUNNER_PLUGIN")),
        }),
        {}
      )
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
