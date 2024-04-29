import {
  array,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
  define,
  any,
  Infer,
} from "superstruct";

// https://github.com/afram/is-uuid/blob/master/lib/is-uuid.js
const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

import { envString, firstEnvValueOf } from "../env.js";

const testResult = enums(["passed", "failed", "timedOut", "skipped", "unknown"]);
const testError = object({
  message: string(),
  line: optional(number()),
  column: optional(number()),
});

const test = object({
  id: optional(string()),
  parentId: optional(string()),
  title: string(),
  path: optional(array(string())),
  relativePath: optional(string()),
  result: testResult,
  error: optional(testError),
  relativeStartTime: optional(number()),
  duration: optional(number()),
  steps: optional(array(any())),
});

const v1_0_0 = object({
  suite: optional(envString("RECORD_REPLAY_METADATA_TEST_SUITE")),
  file: optional(envString("RECORD_REPLAY_METADATA_TEST_FILE")),
  title: envString("RECORD_REPLAY_METADATA_TEST_TITLE"),
  path: optional(array(string())),
  result: defaulted(
    enums(["passed", "failed", "timedOut", "skipped", "unknown"]),
    firstEnvValueOf("RECORD_REPLAY_METADATA_TEST_RESULT")
  ),
  // before/after all hooks
  hooks: optional(
    array(
      object({
        title: string(),
        path: array(string()),
        steps: optional(array(any())),
      })
    )
  ),
  tests: optional(array(test)),
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
          define("uuid", (v: any) => isUuidRegex.test(v)),
          firstEnvValueOf("RECORD_REPLAY_METADATA_TEST_RUN_ID", "RECORD_REPLAY_TEST_RUN_ID")
        ),
        title: optional(envString("RECORD_REPLAY_METADATA_TEST_RUN_TITLE")),
        mode: optional(envString("RECORD_REPLAY_METADATA_TEST_RUN_MODE")),
      }),
      {}
    )
  ),
  reporterErrors: defaulted(array(any()), []),
  version: defaulted(number(), () => 1),
});

export namespace TestMetadataV1 {
  export type UserActionEvent = any;
  export type Test = Infer<typeof test>;
  export type TestResult = Infer<typeof testResult>;
  export type TestRun = Infer<typeof v1_0_0>;
  export type TestError = Infer<typeof testError>;
}

export default {
  "1.0.0": v1_0_0,
};
