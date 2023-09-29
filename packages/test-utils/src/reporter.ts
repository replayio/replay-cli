import { createHash } from "crypto";
import { RecordingEntry, listAllRecordings, uploadRecording } from "@replayio/replay";
import {
  add,
  test as testMetadata,
  source as sourceMetadata,
  source,
} from "@replayio/replay/metadata";
import { query } from "@replayio/replay/src/graphql";
import type { TestMetadataV1, TestMetadataV2 } from "@replayio/replay/metadata/test";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import dbg from "debug";
const uuid = require("uuid");

import { getMetadataFilePath } from "./metadata";
import { pingTestMetrics } from "./metrics";
import { warn } from "./logging";

const debug = dbg("replay:test-utils:reporter");

interface TestRunTestInputModel {
  testId: string;
  index: number;
  attempt: number;
  scope: string[];
  title: string;
  sourcePath: string;
  result: string;
  error: string | null;
  duration: number;
  recordingIds: string[];
}

export interface ReplayReporterConfig {
  runTitle?: string;
  metadata?: Record<string, any> | string;
  upload?: boolean;
  apiKey?: string;
}

export interface TestRunner {
  name: string;
  version: string;
  plugin: string;
}

type UserActionEvent = ReplayReporter["schemaVersion"] extends "1.0.0"
  ? TestMetadataV1.UserActionEvent
  : TestMetadataV2.UserActionEvent;
type Test = ReplayReporter["schemaVersion"] extends "1.0.0"
  ? TestMetadataV1.Test
  : TestMetadataV2.Test;
type TestResult = ReplayReporter["schemaVersion"] extends "1.0.0"
  ? TestMetadataV1.TestResult
  : TestMetadataV2.TestResult;
type TestError = ReplayReporter["schemaVersion"] extends "1.0.0"
  ? TestMetadataV1.TestError
  : TestMetadataV2.TestError;
type TestRun = ReplayReporter["schemaVersion"] extends "1.0.0"
  ? TestMetadataV1.TestRun
  : TestMetadataV2.TestRun;

function parseRuntime(runtime?: string) {
  return ["chromium", "gecko", "node"].find(r => runtime?.includes(r));
}

export class ReporterError extends Error {
  code: number;
  detail: any;

  constructor(code: number, message: string, detail: any = null) {
    super();

    this.name = "ReporterError";
    this.code = code;
    this.message = message;
    this.detail = !detail || typeof detail === "string" ? detail : JSON.stringify(detail);
  }

  valueOf() {
    return {
      code: this.code,
      name: this.name,
      message: this.message,
      detail: this.detail,
    };
  }
}

type PendingWork =
  | {
      type: "recording";
      recordings: RecordingEntry[];
    }
  | {
      type: "test-run";
      id: string;
      phase: "start" | "complete";
    }
  | {
      type: "test-run-tests";
    }
  | {
      type: "upload";
      result: Record<string, boolean>;
    };

class ReplayReporter {
  baseId = uuid.validate(
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID || ""
  )
    ? process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  testRunShardId: string | null = null;
  baseMetadata: Record<string, any> | null = null;
  schemaVersion: string;
  runTitle?: string;
  runner: TestRunner;
  errors: ReporterError[] = [];
  apiKey?: string;
  pendingWork: Promise<PendingWork>[] = [];
  upload = false;

  constructor(runner: TestRunner, schemaVersion: string) {
    this.runner = runner;
    this.schemaVersion = schemaVersion;
  }

  setUpload(upload: boolean) {
    this.upload = upload;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  getResultFromResultCounts(resultCounts: TestRun["resultCounts"]): TestResult {
    const { failed, passed, skipped, timedOut } = resultCounts;

    if (failed > 0) {
      return "failed";
    } else if (timedOut > 0) {
      return "timedOut";
    } else if (passed > 0) {
      return "passed";
    } else if (skipped > 0) {
      return "skipped";
    } else {
      return "unknown";
    }
  }

  summarizeResults(tests: Test[]) {
    let approximateDuration = 0;
    let resultCounts: TestRun["resultCounts"] = {
      failed: 0,
      passed: 0,
      skipped: 0,
      timedOut: 0,
      unknown: 0,
    };

    const testsById: Record<number, Test> = {};
    tests.forEach(test => {
      if (!testsById[test.id] || test.attempt > testsById[test.id].attempt) {
        testsById[test.id] = test;
      }
    });

    Object.values(testsById).forEach(t => {
      approximateDuration += t.approximateDuration || 0;
      switch (t.result) {
        case "failed":
          resultCounts.failed++;
          break;
        case "passed":
          resultCounts.passed++;
          break;
        case "skipped":
          resultCounts.skipped++;
          break;
        case "timedOut":
          resultCounts.timedOut++;
          break;
        default:
          resultCounts.unknown++;
      }
    });

    return { approximateDuration, resultCounts };
  }

  getTestId(source?: Test["source"]) {
    if (!source) {
      return this.baseId;
    }

    return `${this.baseId}-${[...source.scope, source.title].join("-")}`;
  }

  parseConfig(config: ReplayReporterConfig = {}, metadataKey?: string) {
    // always favor environment variables over config so the config can be
    // overwritten at runtime
    this.runTitle = process.env.RECORD_REPLAY_TEST_RUN_TITLE || config.runTitle;

    this.apiKey = process.env.REPLAY_API_KEY || config.apiKey;
    this.upload = !!process.env.REPLAY_UPLOAD || !!config.upload;

    // RECORD_REPLAY_METADATA is our "standard" metadata environment variable.
    // We suppress it for the browser process so we can use
    // RECORD_REPLAY_METADATA_FILE but can still use the metadata here which
    // runs in the test runner process. However, test runners may have a
    // convention for reporter-specific environment configuration which should
    // supersede this.
    if (metadataKey && process.env[metadataKey] && process.env.RECORD_REPLAY_METADATA) {
      console.warn(
        `Cannot set metadata via both RECORD_REPLAY_METADATA and ${metadataKey}. Using ${metadataKey}.`
      );
    }

    const baseMetadata =
      (metadataKey && process.env[metadataKey]) ||
      process.env.RECORD_REPLAY_METADATA ||
      config.metadata ||
      null;
    if (baseMetadata) {
      // Since we support either a string in an environment variable or an
      // object in the cfg, we need to parse out the string value. Technically,
      // you could use a string in the config file too but that'd be unexpected.
      // Nonetheless, it'll be handled correctly here if you're into that sort
      // of thing.
      if (typeof baseMetadata === "string") {
        try {
          this.baseMetadata = JSON.parse(baseMetadata);
        } catch {
          console.warn("Failed to parse Replay metadata");
        }
      } else {
        this.baseMetadata = baseMetadata;
      }
    }
  }

  addError(err: Error | ReporterError) {
    if (err.name === "ReporterError") {
      this.errors.push(err as ReporterError);
    } else {
      this.errors.push(new ReporterError(-1, "Unexpected error", err));
    }
  }

  setDiagnosticMetadata(metadata: Record<string, unknown>) {
    this.baseMetadata = {
      ...this.baseMetadata,
      "x-replay-diagnostics": metadata,
    };
  }

  onTestSuiteBegin(config?: ReplayReporterConfig, metadataKey?: string) {
    this.parseConfig(config, metadataKey);

    debug("onTestSuiteBegin: Reporter Configuration: %o", {
      baseId: this.baseId,
      runTitle: this.runTitle,
      runner: this.runner,
      baseMetadata: this.baseMetadata,
    });

    if (!this.testRunShardId) {
      if (this.apiKey) {
        this.pendingWork.push(this.startTestRunShard());
      } else {
        debug("Skipping starting test run: API Key not set");
      }
    }
  }

  async startTestRunShard(): Promise<PendingWork> {
    let metadata: any = {};
    try {
      metadata = await source.init();
    } catch (e) {
      debug(
        "Failed to initialize source metadata to create test run shard: %s",
        e instanceof Error ? e.message : e
      );
    }

    const { REPLAY_METADATA_TEST_RUN_MODE, RECORD_REPLAY_METADATA_TEST_RUN_MODE } = process.env;

    const testRun = {
      repository: metadata.source?.repository ?? null,
      title: metadata.source?.repository ?? null,
      mode: REPLAY_METADATA_TEST_RUN_MODE ?? RECORD_REPLAY_METADATA_TEST_RUN_MODE ?? null,
      branch: metadata.source?.branch ?? null,
      pullRequestId: metadata.source?.merge?.id ?? null,
      pullRequestTitle: metadata.source?.merge?.title ?? null,
      commitId: metadata.source?.commit?.id ?? null,
      commitTitle: metadata.source?.commit?.title ?? null,
      commitUser: metadata.source?.commit?.user ?? null,
      triggerUrl: metadata.source?.trigger?.url ?? null,
      triggerUser: metadata.source?.trigger?.user ?? null,
      triggerReason: metadata.source?.trigger?.workflow ?? null,
    };

    debug("Creating test run shard for user-key %s", this.baseId);

    const resp = await query(
      "CreateTestRunShard",
      `
        mutation CreateTestRunShard($userKey: String!, $testRun: TestRunShardInput!) {
          startTestRunShard(input: {
            userKey: $userKey,
            testRun: $testRun
          }) {
            success
            testRunShardId
          }
        }
      `,
      {
        userKey: this.baseId,
        testRun,
      },
      this.apiKey
    );

    if (resp.errors) {
      warn("Failed to start a new test run", new Error(resp.errors[0].message));
      throw new Error("Failed to start a new test run");
    }

    this.testRunShardId = resp.data.startTestRunShard.testRunShardId;

    if (!this.testRunShardId) {
      throw new Error("Unexpected error retrieving test run shard id");
    }

    debug("Created test run shard %s for user key %s", this.testRunShardId, this.baseId);

    return {
      type: "test-run",
      id: this.testRunShardId,
      phase: "start",
    };
  }

  async addTestsToShard(tests: TestRunTestInputModel[]): Promise<PendingWork> {
    if (!this.testRunShardId) {
      throw new Error("Unable to add tests to test run: ID not set");
    }

    debug("Adding %d tests to shard %s", tests.length, this.testRunShardId);

    const resp = await query(
      "AddTestsToShard",
      `
        mutation AddTestsToShard($testRunShardId: String!, $tests: [TestRunTestInputType!]!) {
          addTestsToShard(input: {
            testRunShardId: $testRunShardId,
            tests: $tests
          }) {
            success
          }
        }
      `,
      {
        testRunShardId: this.testRunShardId,
        tests,
      },
      this.apiKey
    );

    if (resp.errors) {
      throw new Error("Unexpected error adding tests to run");
    }

    debug("Successfully added tests to shard %s", this.testRunShardId);

    return {
      type: "test-run-tests",
    };
  }

  async completeTestRunShard(): Promise<PendingWork> {
    if (!this.testRunShardId) {
      throw new Error("Unable to complete test run: ID not set");
    }

    debug("Marking test run shard %s complete", this.testRunShardId);

    const resp = await query(
      "CompleteTestRunShard",
      `
        mutation CompleteTestRunShard($testRunShardId: String!) {
          completeTestRunShard(input: {
            testRunShardId: $testRunShardId
          }) {
            success
          }
        }
      `,
      {
        testRunShardId: this.testRunShardId,
      },
      this.apiKey
    );

    if (resp.errors) {
      throw new Error("Unexpected error completing test run shard");
    }

    debug("Successfully marked test run shard %s complete", this.testRunShardId);

    return {
      type: "test-run",
      id: this.testRunShardId,
      phase: "complete",
    };
  }

  onTestBegin(source?: Test["source"], metadataFilePath = getMetadataFilePath("REPLAY_TEST", 0)) {
    debug("onTestBegin: %o", source);

    const id = this.getTestId(source);
    this.errors = [];
    const metadata = {
      ...(this.baseMetadata || {}),
      "x-replay-test": {
        id,
      },
    };

    debug("onTestBegin: Writing metadata to %s: %o", metadataFilePath, metadata);

    try {
      mkdirSync(dirname(metadataFilePath), { recursive: true });
      writeFileSync(metadataFilePath, JSON.stringify(metadata, undefined, 2), {});
    } catch (e) {
      warn("Failed to initialize Replay metadata", e);
    }
  }

  onTestEnd({
    tests,
    specFile,
    replayTitle,
    extraMetadata,
  }: {
    tests: Test[];
    specFile: string;
    replayTitle?: string;
    extraMetadata?: Record<string, unknown>;
  }) {
    debug("onTestEnd: %s", specFile);

    // if we bailed building test metadata because of a crash or because no
    // tests ran, we can bail here too
    if (tests.length === 0) {
      debug("onTestEnd: No tests found");
      return;
    }

    this.pendingWork.push(this.addMetadata(tests, specFile, replayTitle, extraMetadata));
  }

  buildTestId(sourcePath: string, test: Test) {
    return createHash("sha1")
      .update([sourcePath, test.id, ...test.source.scope, test.source.title].join("-"))
      .digest("hex");
  }

  async uploadRecordings(recordings: RecordingEntry[]): Promise<PendingWork> {
    debug("Starting upload of %d recordings", recordings.length);

    const results = await Promise.allSettled(
      recordings.map(r => {
        return uploadRecording(r.id, {
          apiKey: this.apiKey,
        });
      })
    );

    let uploaded = 0;
    const result: Record<string, boolean> = {};
    results.forEach((r, i) => {
      const success = r.status === "fulfilled" && r.value != null;
      result[recordings[i].id] = success;

      if (success) {
        uploaded++;
      }
    });

    debug("Successfully uploaded of %d of %d recordings", uploaded, recordings.length);

    return {
      type: "upload",
      result,
    };
  }

  async addMetadata(
    tests: Test[],
    specFile: string,
    replayTitle?: string,
    extraMetadata?: Record<string, unknown>
  ): Promise<PendingWork> {
    const filter = `function($v) { $v.metadata.\`x-replay-test\`.id in ${JSON.stringify([
      ...tests.map(test => this.getTestId(test.source)),
      this.getTestId(),
    ])} and $not($exists($v.metadata.test)) }`;

    const recordings = listAllRecordings({
      filter,
    });

    debug("onTestEnd: Found %d recs with filter %s", recordings.length, filter);

    const test = tests[0];
    const { approximateDuration, resultCounts } = this.summarizeResults(tests);
    const result = this.getResultFromResultCounts(resultCounts);
    const source = {
      path: specFile,
      title: replayTitle || test.source.title,
    };

    const metadata: TestRun = {
      approximateDuration,
      source,
      result,
      resultCounts,
      run: {
        id: this.baseId,
        title: this.runTitle,
      },
      tests,
      environment: {
        errors: this.errors.map(e => e.valueOf()),
        pluginVersion: this.runner.plugin,
        testRunner: {
          name: this.runner.name,
          version: this.runner.version,
        },
      },
      schemaVersion: this.schemaVersion,
    };

    let recordingId: string | undefined;
    let runtime: string | undefined;
    let validatedTestMetadata: { test: TestRun } | undefined;
    if (recordings.length > 0) {
      recordingId = recordings[0].id;
      runtime = recordings[0].runtime;

      debug("onTestEnd: Adding test metadata to %s", recordingId);
      debug("onTestEnd: Includes %s errors", this.errors.length);

      validatedTestMetadata = testMetadata.init(metadata) as { test: TestMetadataV2.TestRun };

      let mergedMetadata = {
        title: replayTitle || test.source.title,
        ...extraMetadata,
        ...validatedTestMetadata,
      };

      try {
        const validatedSourceMetadata = await sourceMetadata.init();
        mergedMetadata = {
          ...mergedMetadata,
          ...validatedSourceMetadata,
        };
      } catch (e) {
        debug("Failed to generate source metadata: %s", e instanceof Error ? e.message : e);
      }

      const recordingIds = recordings.map(r => r.id);
      this.pendingWork.push(
        this.addTestsToShard(
          tests.map<TestRunTestInputModel>(t => ({
            testId: this.buildTestId(source.path, t),
            index: t.id,
            attempt: t.attempt,
            scope: t.source.scope,
            title: t.source.title,
            sourcePath: source.path,
            result: t.result,
            error: t.error ? t.error.message : null,
            duration: t.approximateDuration,
            recordingIds,
          }))
        )
      );

      recordings.forEach(rec => add(rec.id, mergedMetadata));

      if (this.upload && this.apiKey) {
        this.pendingWork.push(this.uploadRecordings(recordings));
      } else {
        debug("Skipping upload: %o", { upload: this.upload, apiKey: !!this.apiKey });
      }
    }

    pingTestMetrics(
      recordingId,
      this.baseId,
      {
        id: source.path + "#" + source.title,
        source,
        approximateDuration,
        recorded: !!recordingId,
        runtime: parseRuntime(runtime),
        runner: this.runner.name,
        result: result,
      },
      this.apiKey
    );

    return {
      type: "recording",
      recordings: listAllRecordings({
        all: true,
        filter,
      }),
    };
  }

  async onEnd() {
    debug("onEnd");
    if (this.apiKey) {
      this.pendingWork.push(this.completeTestRunShard());
    } else {
      debug("Skipping completing test run: API Key not set");
    }

    const results = await Promise.allSettled(this.pendingWork);

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    if (failures.length > 0) {
      warn(`Failed to update metadata for ${failures.length} tests`);
    }

    return results
      .filter((r): r is PromiseFulfilledResult<PendingWork> => r.status === "fulfilled")
      .map(r => r.value);
  }
}

export default ReplayReporter;
export type { UserActionEvent, Test, TestResult, TestError, TestMetadataV1, TestMetadataV2 };
