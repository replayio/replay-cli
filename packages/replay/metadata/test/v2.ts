import {
  array,
  defaulted,
  enums,
  number,
  object,
  optional,
  string,
  define,
  nullable,
  Infer,
  assign,
  omit,
  record,
} from "superstruct";
const isUuid = require("is-uuid");

import { firstEnvValueOf } from "../env";

const testError = object({
  name: string(),
  message: string(),
  line: optional(number()),
  column: optional(number()),
});

const userActionEvent = object({
  data: object({
    id: string(),
    parentId: nullable(string()),
    category: enums(["assertion", "command", "other"]),
    command: object({
      arguments: array(string()),
      name: string(),
    }),
    scope: nullable(array(string())),
    error: nullable(testError),
  }),
});

const testResult = enums(["failed", "passed", "skipped", "timedOut", "unknown"]);

const test_v2_0_0 = object({
  events: object({
    afterAll: array(userActionEvent),
    afterEach: array(userActionEvent),
    beforeAll: array(userActionEvent),
    beforeEach: array(userActionEvent),
    main: array(userActionEvent),
  }),
  approximateDuration: number(),
  result: testResult,
  source: object({
    scope: array(string()),
    title: string(),
  }),
  error: nullable(testError),
});

const v2_0_0 = object({
  approximateDuration: number(),
  environment: object({
    errors: defaulted(
      array(
        object({
          code: number(),
          detail: nullable(string()),
          name: string(),
          message: string(),
        })
      ),
      []
    ),
    pluginVersion: string(),
    testRunner: object({
      name: string(),
      version: string(),
    }),
  }),
  result: testResult,
  resultCounts: record(testResult, number()),
  schemaVersion: defaulted(string(), () => "2.0.0"),
  source: object({
    path: string(),
    title: string(),
  }),
  tests: array(test_v2_0_0),
  run: defaulted(
    object({
      id: defaulted(
        string(),
        firstEnvValueOf(
          "REPLAY_METADATA_TEST_RUN_ID",
          "RECORD_REPLAY_METADATA_TEST_RUN_ID",
          "RECORD_REPLAY_TEST_RUN_ID"
        )
      ),
      title: optional(
        defaulted(
          string(),
          firstEnvValueOf("REPLAY_METADATA_TEST_RUN_TITLE", "RECORD_REPLAY_METADATA_TEST_RUN_TITLE")
        )
      ),
      mode: optional(
        defaulted(
          string(),
          firstEnvValueOf("REPLAY_METADATA_TEST_RUN_MODE", "RECORD_REPLAY_METADATA_TEST_RUN_MODE")
        )
      ),
    }),
    {}
  ),
});

const test_v2_1_0 = assign(
  test_v2_0_0,
  object({
    id: number(),
    attempt: number(),
  })
);

const v2_1_0 = assign(
  v2_0_0,
  object({
    tests: array(test_v2_1_0),
  })
);

export namespace TestMetadataV2 {
  export type UserActionEvent = Infer<typeof userActionEvent>;
  export type Test = Infer<typeof test_v2_1_0>;
  export type TestResult = Infer<typeof testResult>;
  export type TestRun = Infer<typeof v2_1_0>;
  export type TestError = Infer<typeof testError>;
}

export default {
  "2.1.0": v2_1_0,
  "2.0.0": v2_0_0,
};
