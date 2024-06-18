import {
  RecordingEntry,
  exponentialBackoffRetry,
  listAllRecordings,
  query,
  removeRecording,
  uploadRecording,
} from "@replayio/replay";
import { add, source as sourceMetadata, test as testMetadata } from "@replayio/replay/metadata";
import type { TestMetadataV1, TestMetadataV2 } from "@replayio/replay/metadata/test";
import { spawnSync } from "child_process";
import dbg from "debug";
import { mkdirSync, writeFileSync } from "fs";
import assert from "node:assert/strict";
import { dirname } from "path";
import { v4 as uuid } from "uuid";

import { UnstructuredMetadata } from "@replayio/replay";
import { log, warn } from "./logging";
import { getMetadataFilePath } from "./metadata";
import { pingTestMetrics } from "./metrics";
import { buildTestId, generateOpaqueId } from "./testId";

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

const debug = dbg("replay:test-utils:reporter");

interface TestRunTestInputModel {
  testId: string;
  runnerGroupId: string | null;
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

export type UploadStatusThreshold = "all" | "failed-and-flaky" | "failed";

type UploadStatusThresholdInternal = UploadStatusThreshold | "none";

export type UploadOption =
  | boolean
  | {
      /**
       * Minimize the number of recordings uploaded for a test attempt (within a shard).
       * e.g. Only one recording would be uploaded for a failing test attempt, regardless of retries.
       * e.g. Two recordings would be uploaded for a flaky test attempt (the passing test and one of the failures).
       */
      minimizeUploads?: boolean;
      statusThreshold?: UploadStatusThreshold;
    };

interface UploadableTestExecutionResult<TRecordingMetadata extends UnstructuredMetadata> {
  executionGroupId: string;
  attempt: number;
  maxAttempts: number;
  recordings: RecordingEntry<TRecordingMetadata>[];
  result: TestRun["result"];
  testId: string;
}

interface UploadableTestResult<TRecordingMetadata extends UnstructuredMetadata> {
  executions: Record<string, UploadableTestExecutionResult<TRecordingMetadata>[]>;
  uploadedStatuses: {
    passed: boolean;
    failed: boolean;
  };
}

export interface ReplayReporterConfig<
  TRecordingMetadata extends UnstructuredMetadata = UnstructuredMetadata
> {
  runTitle?: string;
  metadata?: Record<string, any> | string;
  metadataKey?: string;
  upload?: UploadOption;
  apiKey?: string;
  /** @deprecated Use `upload.minimizeUploads` and `upload.statusThreshold` instead */
  filter?: (r: RecordingEntry<TRecordingMetadata>) => boolean;
}

export interface TestRunner {
  name: string;
  version: string | undefined;
  plugin: string;
}

type UserActionEvent = TestMetadataV2.UserActionEvent;
type Test = TestMetadataV2.Test;
type TestResult = TestMetadataV2.TestResult;
type TestError = TestMetadataV2.TestError;
type TestRun = TestMetadataV2.TestRun;

type PendingWorkType = "test-run" | "test-run-tests" | "post-test" | "upload";
export type PendingWorkError<K extends PendingWorkType, TErrorData = {}> = TErrorData & {
  type: K;
  error: Error;
};
export type PendingUploadError = Extract<UploadPendingWork, { error: {} }>;

type PendingWorkEntry<TType extends PendingWorkType, TSuccessData = {}, TErrorData = {}> =
  | PendingWorkError<TType, TErrorData>
  | (TSuccessData & { type: TType; error?: never });
type TestRunPendingWork = PendingWorkEntry<
  "test-run",
  {
    id: string;
    phase: "start" | "complete";
  }
>;
type TestRunTestsPendingWork = PendingWorkEntry<"test-run-tests">;
type UploadPendingWork = PendingWorkEntry<
  "upload",
  {
    recording: RecordingEntry;
  },
  {
    recording: RecordingEntry;
  }
>;
type PostTestPendingWork = PendingWorkEntry<
  "post-test",
  {
    recordings: RecordingEntry[];
    testRun: TestRun;
  }
>;
type PendingWork =
  | TestRunPendingWork
  | TestRunTestsPendingWork
  | UploadPendingWork
  | PostTestPendingWork;

function getErrorMessage(e: unknown) {
  return e && typeof e === "object" && "message" in e ? (e.message as string) : "Unknown Error";
}

function logPendingWorkErrors(errors: PendingWorkError<any>[]) {
  return errors.map(e => `   - ${e.error.message}`);
}

function getTestResult(recording: RecordingEntry): TestRun["result"] {
  const test = recording.metadata.test as TestRun | undefined;
  return !test ? "unknown" : test.result;
}

function getTestResultEmoji(recording: RecordingEntry) {
  const result = getTestResult(recording);
  switch (result) {
    case "unknown":
      return "﹖";
    case "failed":
    case "timedOut":
      return "❌";
    case "passed":
      return "✅";
    case "skipped":
      return "🤷";
  }
}

const resultOrder = ["failed", "timedOut", "passed", "skipped", "unknown"];

function sortRecordingsByResult(recordings: RecordingEntry[]) {
  return [...recordings].sort((a, b) => {
    return (
      resultOrder.indexOf(getTestResult(a)) - resultOrder.indexOf(getTestResult(b)) ||
      ((a.metadata.title as string) || "").localeCompare((b.metadata.title as string) || "")
    );
  });
}

function parseRuntime(runtime?: string) {
  return ["chromium", "gecko", "node"].find(r => runtime?.includes(r));
}

function throwGraphqlErrors(operation: string, errors: any) {
  errors.forEach((e: any) => debug("Error from GraphQL operation %s: %o", operation, e));
  throw new Error(
    `GraphQL request for ${operation} failed (${errors.map(getErrorMessage).join(", ")})`
  );
}

function isNonNullable<T>(arg: T): arg is NonNullable<T> {
  return arg !== null && arg !== undefined;
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

function getFallbackRunTitle() {
  // for CI runs we don't want to set an explicit title
  // dashboard is meant to use the commit/PR information retrieved on CI
  if (process.env.CI) {
    return;
  }

  let gitChild;

  try {
    gitChild = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return;
  }

  if (gitChild.status !== 0) {
    return;
  }

  return `(local) ${gitChild.stdout.toString().trim()} branch`;
}

class ReplayReporter<TRecordingMetadata extends UnstructuredMetadata = UnstructuredMetadata> {
  private _baseId = sourceMetadata.getTestRunIdFromEnvironment(process.env) || uuid();
  private _testRunShardId: string | null = null;
  private _baseMetadata: Record<string, any> | null = null;
  private _schemaVersion: string;
  private _runTitle?: string;
  private _runner: TestRunner;
  private _errors: ReporterError[] = [];
  private _apiKey?: string;
  private _pendingWork: Promise<PendingWork>[] = [];
  private _upload = false;
  private _filter?: (r: RecordingEntry<TRecordingMetadata>) => boolean;
  private _minimizeUploads = false;
  private _uploadableResults: Map<string, UploadableTestResult<TRecordingMetadata>> = new Map();
  private _testRunShardIdPromise: Promise<TestRunPendingWork> | null = null;
  private _uploadStatusThreshold: UploadStatusThresholdInternal = "none";

  constructor(
    runner: TestRunner,
    schemaVersion: string,
    config?: ReplayReporterConfig<TRecordingMetadata>
  ) {
    this._runner = runner;
    this._schemaVersion = schemaVersion;
    if (config) {
      const { metadataKey, ...rest } = config;
      this._parseConfig(rest, metadataKey);
    }
  }

  setTestRunnerVersion(version: TestRunner["version"]) {
    this._runner = {
      ...this._runner,
      version: version,
    };
  }

  setApiKey(apiKey: string) {
    this._apiKey = apiKey;
  }

  private _getResultFromResultCounts(resultCounts: TestRun["resultCounts"]): TestResult {
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

  private _summarizeResults(tests: Test[]) {
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

  private _parseConfig(
    config: ReplayReporterConfig<TRecordingMetadata> = {},
    metadataKey?: string
  ) {
    this._apiKey = config.apiKey || process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY;
    this._upload = "upload" in config ? !!config.upload : !!process.env.REPLAY_UPLOAD;
    if (this._upload && !this._apiKey) {
      throw new Error(
        `\`@replayio/${this._runner.name}/reporter\` requires an API key to upload recordings. Either pass a value to the apiKey plugin configuration or set the REPLAY_API_KEY environment variable`
      );
    }
    if (this._upload) {
      if (typeof config.upload === "object") {
        this._minimizeUploads = !!config.upload.minimizeUploads;
        this._uploadStatusThreshold = config.upload.statusThreshold ?? "all";
      } else {
        this._uploadStatusThreshold = "all";
      }
    }

    // always favor environment variables over config so the config can be
    // overwritten at runtime
    this._runTitle =
      process.env.REPLAY_METADATA_TEST_RUN_TITLE ||
      process.env.RECORD_REPLAY_TEST_RUN_TITLE ||
      process.env.RECORD_REPLAY_METADATA_TEST_RUN_TITLE ||
      config.runTitle ||
      getFallbackRunTitle();

    this._filter = config.filter;

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
          this._baseMetadata = JSON.parse(baseMetadata);
        } catch {
          console.warn("Failed to parse Replay metadata");
        }
      } else {
        this._baseMetadata = baseMetadata;
      }
    }
  }

  addError(err: Error | ReporterError) {
    if (err.name === "ReporterError") {
      this._errors.push(err as ReporterError);
    } else {
      this._errors.push(new ReporterError(-1, "Unexpected error", err));
    }
  }

  setDiagnosticMetadata(metadata: Record<string, unknown>) {
    this._baseMetadata = {
      ...this._baseMetadata,
      "x-replay-diagnostics": metadata,
    };
  }

  onTestSuiteBegin(config?: ReplayReporterConfig<TRecordingMetadata>, metadataKey?: string) {
    if (config || metadataKey) {
      this._parseConfig(config, metadataKey);
    }

    debug("onTestSuiteBegin: Reporter Configuration: %o", {
      baseId: this._baseId,
      runTitle: this._runTitle,
      runner: this._runner,
      baseMetadata: this._baseMetadata,
      upload: this._upload,
      hasApiKey: !!this._apiKey,
      hasFilter: !!this._filter,
    });

    if (!this._apiKey) {
      debug("Skipping starting test run: API key not set");
      return;
    }

    if (this._testRunShardIdPromise) {
      return;
    }

    this._testRunShardIdPromise = this._startTestRunShard();
    this._pendingWork.push(this._testRunShardIdPromise);
  }

  private async _startTestRunShard(): Promise<TestRunPendingWork> {
    let metadata: any = {};
    try {
      metadata = await sourceMetadata.init();
    } catch (e) {
      debug(
        "Failed to initialize source metadata to create test run shard: %s",
        e instanceof Error ? e.message : e
      );
    }

    const { REPLAY_METADATA_TEST_RUN_MODE, RECORD_REPLAY_METADATA_TEST_RUN_MODE } = process.env;

    const testRun = {
      runnerName: this._runner.name,
      runnerVersion: this._runner.version,
      repository: metadata.source?.repository ?? null,
      title: this._runTitle ?? null,
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

    debug("Creating test run shard for user-key %s", this._baseId);

    try {
      return exponentialBackoffRetry(async () => {
        const resp = await query(
          "CreateTestRunShard",
          `
          mutation CreateTestRunShard($clientKey: String!, $testRun: TestRunShardInput!) {
            startTestRunShard(input: {
              clientKey: $clientKey,
              testRun: $testRun
            }) {
              success
              testRunShardId
            }
          }
        `,
          {
            clientKey: this._baseId,
            testRun,
          },
          this._apiKey
        );

        if (resp.errors) {
          throwGraphqlErrors("CreateTestRunShard", resp.errors);
        }

        const testRunShardId = resp.data.startTestRunShard.testRunShardId;

        if (!testRunShardId) {
          return {
            type: "test-run",
            error: new Error("Unexpected error retrieving test run shard id"),
          };
        }

        debug("Created test run shard %s for user key %s", testRunShardId, this._baseId);
        this._testRunShardId = testRunShardId;

        return {
          type: "test-run",
          id: testRunShardId,
          phase: "start",
        };
      });
    } catch (e) {
      debug("start test run error: %s", e);
      return {
        type: "test-run",
        error: new Error(`Unexpected error starting test run shard: ${getErrorMessage(e)}`),
      };
    }
  }

  private async _addTestsToShard(tests: TestRunTestInputModel[]): Promise<TestRunTestsPendingWork> {
    let testRunShardId = this._testRunShardId;
    if (!testRunShardId) {
      await this._testRunShardIdPromise;
      testRunShardId = this._testRunShardId;
      if (!testRunShardId) {
        return {
          type: "test-run-tests",
          error: new Error("Unable to add tests to test run: ID not set"),
        };
      }
    }
    debug("Adding %d tests to shard %s", tests.length, testRunShardId);

    try {
      await exponentialBackoffRetry(async () => {
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
            testRunShardId,
            tests,
          },
          this._apiKey
        );

        if (resp.errors) {
          throwGraphqlErrors("AddTestsToShard", resp.errors);
        }
      });

      debug("Successfully added tests to shard %s", testRunShardId);

      return {
        type: "test-run-tests",
      };
    } catch (e) {
      debug("Add tests to run error: %s", e);
      return {
        type: "test-run-tests",
        error: new Error(`Unexpected error adding tests to run: ${getErrorMessage(e)}`),
      };
    }
  }

  private async _completeTestRunShard(): Promise<TestRunPendingWork> {
    let testRunShardId = this._testRunShardId;
    if (!testRunShardId) {
      await this._testRunShardIdPromise;
      testRunShardId = this._testRunShardId;
      if (!testRunShardId) {
        return {
          type: "test-run",
          error: new Error("Unable to complete test run: ID not set"),
        };
      }
    }

    debug("Marking test run shard %s complete", testRunShardId);

    try {
      await exponentialBackoffRetry(async () => {
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
            testRunShardId,
          },
          this._apiKey
        );

        if (resp.errors) {
          throwGraphqlErrors("CompleteTestRunShard", resp.errors);
        }
      });

      debug("Successfully marked test run shard %s complete", testRunShardId);

      return {
        type: "test-run",
        id: testRunShardId,
        phase: "complete",
      };
    } catch (e) {
      debug("complete test run shard error: %s", e);
      return {
        type: "test-run",
        error: new Error(`Unexpected error completing test run shard: ${getErrorMessage(e)}`),
      };
    }
  }

  onTestBegin(testExecutionId?: string, metadataFilePath = getMetadataFilePath("REPLAY_TEST", 0)) {
    debug("onTestBegin: %o", testExecutionId);

    this._errors = [];
    const metadata = {
      ...(this._baseMetadata || {}),
      "x-replay-test": {
        id: testExecutionId ? `${this._baseId}-${testExecutionId}` : this._baseId,
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
    runnerGroupKey,
  }: {
    tests: Test[];
    specFile: string;
    replayTitle?: string;
    extraMetadata?: Record<string, unknown>;
    runnerGroupKey?: string;
  }) {
    debug("onTestEnd: %s", specFile);

    // if we bailed building test metadata because of a crash or because no
    // tests ran, we can bail here too
    if (tests.length === 0) {
      debug("onTestEnd: No tests found");
      return;
    }

    this._pendingWork.push(
      this._enqueuePostTestWork(tests, specFile, runnerGroupKey, replayTitle, extraMetadata)
    );
  }

  private async _uploadRecording(
    recording: RecordingEntry<TRecordingMetadata>
  ): Promise<UploadPendingWork> {
    debug("Starting upload of %s", recording.id);

    try {
      await uploadRecording(recording.id, {
        apiKey: this._apiKey,
        // Per TT-941, we want to throw on any error so it can be caught below
        // and reported back to the user rather than just returning null
        strict: true,
        // uploads are enqueued in this reporter asap
        // but the extra assets should be removed after all of them are uploaded
        removeAssets: false,
      });

      debug("Successfully uploaded %s", recording.id);

      const recordings = listAllRecordings({ filter: r => r.id === recording.id, all: true });

      return {
        type: "upload",
        recording: recordings[0],
      };
    } catch (e) {
      debug("upload error: %s", e);
      return {
        type: "upload",
        recording,
        error: new Error(getErrorMessage(e)),
      };
    }
  }

  getRecordingsForTest(tests: { executionId: string }[]) {
    const filter = `function($v) { $v.metadata.\`x-replay-test\`.id in ${JSON.stringify([
      ...tests.map(test => `${this._baseId}-${test.executionId}`),
      this._baseId,
    ])} and $not($exists($v.metadata.test)) }`;

    const recordings = listAllRecordings({
      all: false,
      filter,
    });

    debug("Found %d recs with filter %s", recordings.length, filter);

    return recordings;
  }

  private _buildTestMetadata(tests: Test[], specFile: string) {
    const test = tests[0];
    const { approximateDuration, resultCounts } = this._summarizeResults(tests);
    const result = this._getResultFromResultCounts(resultCounts);
    const source = {
      path: specFile,
      title: test.source.title,
    };

    const metadata: TestRun = {
      approximateDuration,
      source,
      result,
      resultCounts,
      run: {
        id: this._baseId,
        title: this._runTitle,
      },
      tests,
      environment: {
        errors: this._errors.map(e => e.valueOf()),
        pluginVersion: this._runner.plugin,
        testRunner: {
          name: this._runner.name,
          version: this._runner.version || "unknown",
        },
      },
      schemaVersion: this._schemaVersion,
    };

    return metadata;
  }

  private async _setRecordingMetadata(
    recordings: RecordingEntry[],
    testRun: TestRun,
    replayTitle?: string,
    extraMetadata?: Record<string, unknown>
  ) {
    debug(
      "setRecordingMetadata: Adding test metadata to %o",
      recordings.map(r => r.id)
    );
    debug("setRecordingMetadata: Includes %s errors", this._errors.length);

    const validatedTestMetadata = testMetadata.init({
      ...testRun,
      schemaVersion: this._schemaVersion,
    }) as {
      test: TestMetadataV2.TestRun;
    };

    let mergedMetadata = {
      title: replayTitle || testRun.source.title,
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

    recordings.forEach(rec => add(rec.id, mergedMetadata));

    // Re-fetch recordings so we have the most recent metadata
    const allRecordings = listAllRecordings({ all: true }) as RecordingEntry<TRecordingMetadata>[];
    return allRecordings.filter(recordingWithMetadata =>
      recordings.some(r => r.id === recordingWithMetadata.id)
    );
  }

  private async _enqueuePostTestWork(
    tests: Test[],
    specFile: string,
    runnerGroupKey?: string,
    replayTitle?: string,
    extraMetadata?: Record<string, unknown>
  ): Promise<PendingWork> {
    try {
      const runnerGroupId = runnerGroupKey ? generateOpaqueId(runnerGroupKey) : null;
      const recordings = this.getRecordingsForTest(tests);

      const recordingIds = recordings.map(r => r.id);
      const testInputs = tests.map(t => {
        const testId = buildTestId(specFile, t);
        if (!testId) {
          throw new Error("Failed to generate test id for test");
        }

        return {
          testId,
          runnerGroupId: runnerGroupId,
          index: t.id,
          attempt: t.attempt,
          scope: t.source.scope,
          title: t.source.title,
          sourcePath: specFile,
          result: t.result,
          error: t.error ? t.error.message : null,
          duration: t.approximateDuration,
          recordingIds,
        } satisfies TestRunTestInputModel;
      });

      if (this._apiKey) {
        this._pendingWork.push(this._addTestsToShard(testInputs));
      } else {
        debug("Skipping adding tests to test run: API key not set");
      }

      const testRun = this._buildTestMetadata(tests, specFile);

      if (recordings.length > 0) {
        const recordingsWithMetadata = await this._setRecordingMetadata(
          recordings,
          testRun,
          replayTitle,
          extraMetadata
        );

        this._storeUploadableTestResults(
          tests.map(test => {
            return {
              executionGroupId: test.executionGroupId,
              attempt: test.attempt,
              maxAttempts: test.maxAttempts,
              recordings: recordingsWithMetadata,
              result: test.result,
              testId: buildTestId(specFile, test),
            };
          })
        );
      }

      const firstRecording: RecordingEntry | undefined = recordings[0];
      pingTestMetrics(
        firstRecording?.id,
        this._baseId,
        {
          id: testRun.source.path + "#" + testRun.source.title,
          source: testRun.source,
          approximateDuration: testRun.approximateDuration,
          recorded: firstRecording !== undefined,
          runtime: parseRuntime(firstRecording?.runtime),
          runner: this._runner.name,
          result: testRun.result,
        },
        this._apiKey
      );

      return {
        type: "post-test",
        recordings,
        testRun,
      };
    } catch (e) {
      debug("post-test error: %s", e);
      return {
        type: "post-test",
        error: new Error(`Error setting metadata and uploading replays: ${getErrorMessage(e)}`),
      };
    }
  }

  private _storeUploadableTestResults(
    results: UploadableTestExecutionResult<TRecordingMetadata>[]
  ) {
    if (this._uploadStatusThreshold === "none") {
      return;
    }

    for (const result of results) {
      if (result.result === "skipped") {
        continue;
      }

      let uploadableResults = this._uploadableResults.get(result.testId);
      if (!uploadableResults) {
        uploadableResults = {
          executions: {},
          uploadedStatuses: {
            passed: false,
            failed: false,
          },
        };
        this._uploadableResults.set(result.testId, uploadableResults);
      }
      let executions = uploadableResults.executions[result.executionGroupId];
      if (!executions) {
        executions = [];
        uploadableResults.executions[result.executionGroupId] = executions;
      }
      executions.push(result);

      if (result.result === "passed" || result.attempt >= result.maxAttempts) {
        this._enqueueUploads(uploadableResults, result.executionGroupId);
      }
    }
  }

  private _enqueueUploads(
    result: UploadableTestResult<TRecordingMetadata>,
    executionGroupId: string
  ) {
    const executions = result.executions[executionGroupId];
    const latestExecution = last(executions);
    assert(!!latestExecution, "Expected at least one execution in the list");

    let toUpload: typeof executions | undefined;
    switch (this._uploadStatusThreshold) {
      case "all":
        // even when `minimizeUploads` is combined with `repeatEach` it always makes sense to upload the latest result
        // otherwise, we could upload a single successful attempt without uploading a potential failure of the same test
        // coming from a different `repeatEachIndex`
        toUpload = this._minimizeUploads ? [latestExecution] : executions;
        break;
      case "failed-and-flaky":
        // retries can be disabled so we need to always check if the latest execution is not passed
        // with retries enabled we know that we only have to upload when there was more than one attempt at the test
        // a single passed attempt can be safely ignored, multiple attempts mean that the test is flaky or failing
        // if there is no failed execution then this test is not flaky or failing
        if (latestExecution.result !== "passed" || executions.length > 1) {
          if (!this._minimizeUploads) {
            toUpload = executions;
          } else {
            // we have to make sure to upload flakes spanning runs with different `repeatEachIndex`
            // it's possible with no retries to get have a failed execution group that is separate from a passed one
            if (!result.uploadedStatuses.failed) {
              const failedExecution = executions.findLast(r => r.result !== "passed");
              if (failedExecution) {
                result.uploadedStatuses.failed = true;
                (toUpload ??= []).push(failedExecution);
              }
            }
            if (!result.uploadedStatuses.passed) {
              const passedExecution = executions.findLast(r => r.result === "passed");
              if (passedExecution) {
                result.uploadedStatuses.passed = true;
                (toUpload ??= []).push(passedExecution);
              }
            }
          }
        }
        break;
      case "failed":
        if (latestExecution.result !== "passed") {
          if (this._minimizeUploads) {
            if (result.uploadedStatuses.failed) {
              return;
            }
            result.uploadedStatuses.failed = true;
            toUpload = [latestExecution];
          } else {
            toUpload = executions;
          }
        }
        break;
      case "none":
        return;
    }

    if (!toUpload) {
      return;
    }

    this._pendingWork.push(
      ...toUpload
        .flatMap(result => result.recordings)
        .filter(r => (this._filter ? this._filter(r) : true))
        .map(r => this._uploadRecording(r))
    );
  }

  async onEnd(): Promise<PendingWork[]> {
    debug("onEnd");

    const output: string[] = [];
    let completedWork: PromiseSettledResult<PendingWork>[] = [];

    if (this._pendingWork.length) {
      log("🕑 Completing some outstanding work ...");
    }

    while (this._pendingWork.length) {
      const pendingWork = this._pendingWork;
      debug("Outstanding tasks: %d", pendingWork.length);

      this._pendingWork = [];
      completedWork.push(...(await Promise.allSettled(pendingWork)));
    }

    if (this._apiKey) {
      const postSettledWork = await Promise.allSettled([this._completeTestRunShard()]);
      completedWork.push(...postSettledWork);
    } else {
      debug("Skipping completing test run: API Key not set");
    }

    const failures = completedWork.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    if (failures.length > 0) {
      output.push("Encountered unexpected errors while processing replays");
      failures.forEach(f => output.push(`  ${f.reason}`));
    }

    const results = completedWork
      .filter((r): r is PromiseFulfilledResult<PendingWork> => r.status === "fulfilled")
      .map(r => r.value);

    const errors = {
      "post-test": [] as Extract<PostTestPendingWork, { error: {} }>[],
      "test-run": [] as Extract<TestRunPendingWork, { error: {} }>[],
      "test-run-tests": [] as Extract<TestRunTestsPendingWork, { error: {} }>[],
      upload: [] as Extract<UploadPendingWork, { error: {} }>[],
    };
    let uploads: RecordingEntry[] = [];
    for (const r of results) {
      if ("error" in r) {
        errors[r.type].push(r as any);
      } else {
        if (r.type === "upload") {
          uploads.push(r.recording);
        }
      }
    }

    if (errors["post-test"].length > 0) {
      output.push(`\n❌ We encountered some unexpected errors processing your recordings`);
      output.push(...logPendingWorkErrors(errors["post-test"]));
    }

    if (errors["test-run-tests"].length > 0 || errors["test-run"].length > 0) {
      output.push("\n❌ We encountered some unexpected errors creating your tests on replay.io");
      output.push(...logPendingWorkErrors(errors["test-run-tests"]));
      output.push(...logPendingWorkErrors(errors["test-run"]));
    }

    if (errors["upload"].length > 0) {
      output.push(`\n❌ Failed to upload ${errors["upload"].length} recordings:\n`);

      errors["upload"].forEach(err => {
        if ("recording" in err) {
          const r = err.recording;
          output.push(`   ${(r.metadata.title as string | undefined) || "Unknown"}`);
          output.push(`      ${getErrorMessage(err.error)}\n`);
        }
      });
    }

    if (uploads.length > 0) {
      const recordingIds = uploads.map(u => u.recordingId).filter(isNonNullable);
      for (const recordingId of recordingIds) {
        removeRecording(recordingId);
      }

      const uploaded = uploads.filter(u => u.status === "uploaded");
      const crashed = uploads.filter(u => u.status === "crashUploaded");

      if (uploaded.length > 0) {
        output.push(`\n🚀 Successfully uploaded ${uploads.length} recordings:\n`);
        const sortedUploads = sortRecordingsByResult(uploads);
        sortedUploads.forEach(r => {
          output.push(
            `   ${getTestResultEmoji(r)} ${(r.metadata.title as string | undefined) || "Unknown"}`
          );
          output.push(
            `      ${process.env.REPLAY_VIEW_HOST || "https://app.replay.io"}/recording/${r.id}\n`
          );
        });
      }

      if (crashed.length > 0) {
        output.push(
          `\n❗️ ${crashed.length} crash reports were generated for tests that crashed while recording.\n`
        );
        output.push(`  The Replay team has been notified.`);
      }
    }

    log(output.join("\n"));

    return results;
  }
}

export default ReplayReporter;
export type { Test, TestError, TestMetadataV1, TestMetadataV2, TestResult, UserActionEvent };
