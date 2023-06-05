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
  record,
} from "superstruct";
const isUuid = require("is-uuid");

import { envString, firstEnvValueOf } from "../env";

const testError = object({
  name: string(),
  message: string(),
  line: optional(number()),
  column: optional(number()),
});

const testAction = object({
  id: string(), // ****
  parentId: optional(string()), // ****
  category: enums(["assertion", "command", "other"]),
  command: object({
    arguments: array(string()), // ****
    name: string(),
  }),
  error: optional(testError), // ****
});

const scopedAction = assign(
  testAction,
  object({
    scope: array(string()),
  })
);

const testResult = enums(["failed", "passed", "skipped", "timedOut", "unknown"]);

const test = object({
  events: object({
    afterAll: defaulted(array(scopedAction), []),
    afterEach: defaulted(array(scopedAction), []),
    beforeAll: defaulted(array(scopedAction), []),
    beforeEach: defaulted(array(scopedAction), []),
    main: array(testAction),
  }),
  approximateDuration: number(), // ****
  result: testResult,
  source: object({
    scope: array(string()),
    title: string(),
  }),
  error: optional(testError), // ****
});

const v2_0_0 = object({
  suiteName: optional(envString("REPLAY_METADATA_TEST_SUITENAME")), // ****
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
  resultCounts: record(testResult, number()),
  schemaVersion: defaulted(string(), () => "2.0.0"),
  source: object({
    path: string(),
    title: string(),
  }),
  tests: array(test),
  run: defaulted(
    // ****
    object({
      id: defaulted(
        define("uuid", (v: any) => isUuid.v4(v)),
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

export type TestAction = Infer<typeof testAction>;
export type ScopedTestAction = Infer<typeof scopedAction>;
export type Test = Infer<typeof test>;
export type TestResult = Infer<typeof testResult>;
export type TestRun = Infer<typeof v2_0_0>;
export type TestError = Infer<typeof testError>;
export default {
  "2.0.0": v2_0_0,
};
