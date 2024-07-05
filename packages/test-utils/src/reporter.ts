import { retryWithExponentialBackoff } from "@replay-cli/shared/async/retryOnFailure";
import { getAuthInfo } from "@replay-cli/shared/graphql/getAuthInfo";
import { queryGraphQL } from "@replay-cli/shared/graphql/queryGraphQL";
import { logger } from "@replay-cli/shared/logger";
import { Properties, mixpanelAPI } from "@replay-cli/shared/mixpanel/mixpanelAPI";
import { UnstructuredMetadata } from "@replay-cli/shared/recording/types";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import assert from "node:assert/strict";
import { dirname } from "path";
import { v4 as uuid } from "uuid";
import { getAccessToken } from "./getAccessToken";
import { listAllRecordings, removeRecording, uploadRecording } from "./legacy-cli";
import { add, source as sourceMetadata, test as testMetadata } from "./legacy-cli/metadata";
import type { TestMetadataV2 } from "./legacy-cli/metadata/test";
import { log } from "./logging";
import { getMetadataFilePath } from "./metadata";
import { pingTestMetrics } from "./metrics";
import { buildTestId, generateOpaqueId } from "./testId";
import type { RecordingEntry, ReplayReporterConfig, UploadStatusThreshold } from "./types";
import { getErrorMessage } from "./legacy-cli/error";

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

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

type UploadStatusThresholdInternal = UploadStatusThreshold | "none";

interface UploadableTestExecutionResult<TRecordingMetadata extends UnstructuredMetadata> {
  executionGroupId: string;
  attempt: number;
  maxAttempts: number;
  recordings: RecordingEntry<TRecordingMetadata>[];
  result: TestRun["result"];
  testId: string;
}

interface UploadableTestResult<TRecordingMetadata extends UnstructuredMetadata> {
  aggregateStatus: "passed" | "failed" | "flaky" | undefined;
  didUploadStatuses: {
    passed: boolean;
    failed: boolean;
  };
  executions: Record<string, UploadableTestExecutionResult<TRecordingMetadata>[]>;
}

export interface TestRunner {
  name: string;
  version: string | undefined;
  plugin: string;
}

export type UserActionEvent = TestMetadataV2.UserActionEvent;
export type Test = TestMetadataV2.Test;
export type TestResult = TestMetadataV2.TestResult;
export type TestError = TestMetadataV2.TestError;
export type TestRun = TestMetadataV2.TestRun;

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
export type PendingWork =
  | TestRunPendingWork
  | TestRunTestsPendingWork
  | UploadPendingWork
  | PostTestPendingWork;

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

function createGraphqlError(operation: string, errors: any) {
  const errorMessages = errors.map(getErrorMessage);
  logger.error("GraphQlOperationFailed", { operation, errors: errors.map(getErrorMessage) });

  for (const error of errors) {
    switch (error.extensions?.code) {
      case "UNAUTHENTICATED":
        return new Error(error.message);
    }
  }
  return new Error(`GraphQL request for ${operation} failed (${errorMessages.join(", ")})`);
}

function isNonNullable<T>(arg: T) {
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

export default class ReplayReporter<
  TRecordingMetadata extends UnstructuredMetadata = UnstructuredMetadata
> {
  private _baseId = sourceMetadata.getTestRunIdFromEnvironment(process.env) || uuid();
  private _testRunShardId: string | null = null;
  private _baseMetadata: Record<string, any> | null = null;
  private _schemaVersion: string;
  private _runTitle?: string;
  private _runner: TestRunner;
  private _errors: ReporterError[] = [];
  private _apiKey?: string;
  private _pendingWork: Promise<PendingWork | undefined>[] = [];
  private _upload = false;
  private _minimizeUploads = false;
  private _uploadableResults: Map<string, UploadableTestResult<TRecordingMetadata>> = new Map();
  private _testRunShardIdPromise: Promise<TestRunPendingWork> | null = null;
  private _uploadStatusThreshold: UploadStatusThresholdInternal = "none";
  private _cacheAuthIdsPromise: Promise<void> | null = null;
  private _uploadedRecordings = new Set<string>();

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

    if (this._apiKey) {
      this._cacheAuthIdsPromise = getAuthInfo(this._apiKey)
        .then(authInfo => {
          logger.identify(authInfo);
          logger.info("ReplayReporter:LoggerIdentificationAdded");
        })
        .catch(error =>
          logger.info("ReplayReporter:LoggerIdentificationFailed", {
            error,
          })
        );
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
    this._apiKey = getAccessToken(config);
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

  addError(error: Error | ReporterError, context?: Properties) {
    logger.error("AddError", { error });

    mixpanelAPI.trackEvent(`test-suite.error.${error.name}`, { context, error });

    if (error.name === "ReporterError") {
      this._errors.push(error as ReporterError);
    } else {
      this._errors.push(new ReporterError(-1, "Unexpected error", error));
    }
  }

  setDiagnosticMetadata(metadata: Record<string, unknown>) {
    this._baseMetadata = {
      ...this._baseMetadata,
      "x-replay-diagnostics": metadata,
    };

    mixpanelAPI.appendAdditionalProperties({ baseMetadata: this._baseMetadata });
  }

  onTestSuiteBegin(config?: ReplayReporterConfig<TRecordingMetadata>, metadataKey?: string) {
    if (config || metadataKey) {
      this._parseConfig(config, metadataKey);
    }

    logger.info("OnTestSuiteBegin:ReporterConfiguration", {
      baseId: this._baseId,
      runTitle: this._runTitle,
      runner: this._runner,
      baseMetadata: this._baseMetadata,
      upload: this._upload,
      hasApiKey: !!this._apiKey,
    });

    mixpanelAPI.trackEvent("test-suite.begin", {
      baseId: this._baseId,
      runTitle: this._runTitle,
      upload: this._upload,
    });

    if (!this._apiKey) {
      logger.info("OnTestSuiteBegin:NoApiKey");

      mixpanelAPI.trackEvent("test-suite.no-api-key");

      return;
    }

    // Don't even record test metadata yet unless/until a test is run with the Replay browser (see onTestBegin)
  }

  private async _startTestRunShard(): Promise<TestRunPendingWork> {
    logger.info("StartTestRunShard:Started");

    let metadata: any = {};
    try {
      metadata = await sourceMetadata.init();
    } catch (error) {
      logger.error("StartTestRunShard:InitMetadataFailed", {
        error,
      });
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

    logger.info("StartTestRunShard:WillCreateShard", { baseId: this._baseId });

    try {
      return retryWithExponentialBackoff(async () => {
        const resp = await queryGraphQL(
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
          return {
            type: "test-run",
            error: createGraphqlError("CreateTestRunShard", resp.errors),
          };
        }

        const testRunShardId = resp.data.startTestRunShard.testRunShardId;

        if (!testRunShardId) {
          return {
            type: "test-run",
            error: new Error("Unexpected error retrieving test run shard id"),
          };
        }

        logger.info("StartTestRunShard:CreatedShard", {
          testRunShardId,
          baseId: this._baseId,
        });
        this._testRunShardId = testRunShardId;

        return {
          type: "test-run",
          id: testRunShardId,
          phase: "start",
        };
      });
    } catch (error) {
      logger.error("StartTestRunShardFailed", {
        error,
      });

      return {
        type: "test-run",
        error: new Error(`Unexpected error starting test run shard: ${getErrorMessage(error)}`),
      };
    }
  }

  private async _addTestsToShard(
    tests: TestRunTestInputModel[]
  ): Promise<TestRunTestsPendingWork | undefined> {
    logger.info("AddTestsToSharded", { testsLength: tests.length });

    let testRunShardId = this._testRunShardId;
    if (!testRunShardId) {
      await this._testRunShardIdPromise;
      testRunShardId = this._testRunShardId;
      if (!testRunShardId) {
        return;
      }
    }
    logger.info("AddTestsToShard:WillAddTests", {
      testsLength: tests.length,
      testRunShardId,
    });

    try {
      await retryWithExponentialBackoff(async () => {
        const resp = await queryGraphQL(
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
          return {
            type: "test-run-tests",
            error: createGraphqlError("AddTestsToShard", resp.errors),
          };
        }
      });

      logger.info("AddTestsToShard:AddedTests", { testRunShardId });

      return {
        type: "test-run-tests",
      };
    } catch (error) {
      logger.error("AddTestsToShard:Failed", { error });
      return {
        type: "test-run-tests",
        error: new Error(`Unexpected error adding tests to run: ${getErrorMessage(error)}`),
      };
    }
  }

  private async _completeTestRunShard(): Promise<TestRunPendingWork | undefined> {
    logger.info("CompleteTestRunShard:Started");

    let testRunShardId = this._testRunShardId;
    if (!testRunShardId) {
      await this._testRunShardIdPromise;
      testRunShardId = this._testRunShardId;
      if (!testRunShardId) {
        return;
      }
    }

    logger.info("CompleteTestRunShard:WillMarkCompleted", { testRunShardId });

    try {
      await retryWithExponentialBackoff(async () => {
        const resp = await queryGraphQL(
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
          return {
            type: "test-run",
            error: createGraphqlError("CompleteTestRunShard", resp.errors),
          };
        }
      });

      logger.info("CompleteTestRunShard:MarkedComplete", { testRunShardId });

      return {
        type: "test-run",
        id: testRunShardId,
        phase: "complete",
      };
    } catch (error) {
      logger.error("CompleteTestRunShard:Failed", {
        error,
        testRunShardId,
      });
      return {
        type: "test-run",
        error: new Error(`Unexpected error completing test run shard: ${getErrorMessage(error)}`),
      };
    }
  }

  onTestBegin(testExecutionId?: string, metadataFilePath = getMetadataFilePath("REPLAY_TEST", 0)) {
    logger.info("OnTestBegin:Started", { testExecutionId });

    if (this._apiKey && !this._testRunShardIdPromise) {
      // This method won't be called until a test is run with the Replay browser
      // We shouldn't save any test metadata until that happens
      this._testRunShardIdPromise = this._startTestRunShard();
      this._pendingWork.push(this._testRunShardIdPromise);
    }

    this._errors = [];
    const metadata = {
      ...(this._baseMetadata || {}),
      "x-replay-test": {
        id: testExecutionId ? `${this._baseId}-${testExecutionId}` : this._baseId,
      },
    };

    logger.info("OnTestBegin:WillWriteMetadata", { metadataFilePath, metadata });

    try {
      mkdirSync(dirname(metadataFilePath), { recursive: true });
      writeFileSync(metadataFilePath, JSON.stringify(metadata, undefined, 2), {});
    } catch (error) {
      logger.error("OnTestBegin:InitReplayMetadataFailed", {
        error,
      });
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
    logger.info("OnTestEnd:Started", { specFile });

    mixpanelAPI.trackEvent("test-suite.test-end", {
      replayTitle,
      specFile,
    });

    // if we bailed building test metadata because of a crash or because no
    // tests ran, we can bail here too
    if (tests.length === 0) {
      logger.info("OnTestEnd:NoTestsFound", { specFile });
      return;
    }

    this._pendingWork.push(
      this._enqueuePostTestWork(tests, specFile, runnerGroupKey, replayTitle, extraMetadata)
    );
  }

  private async _uploadRecording(
    recording: RecordingEntry<TRecordingMetadata>
  ): Promise<UploadPendingWork | undefined> {
    if (this._uploadStatusThreshold === "none" || !this._apiKey) {
      return;
    }
    // Cypress retries are on the same recordings, we only want to upload a single recording once
    if (this._uploadedRecordings.has(recording.id)) {
      logger.info("UploadRecording:AlreadyScheduled", {
        recordingId: recording.id,
      });
      return;
    }
    this._uploadedRecordings.add(recording.id);
    logger.info("UploadRecording:Started", { recordingId: recording.id });

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

      logger.info("UploadRecording:Succeeded", { recording: recording.id });

      const recordings = listAllRecordings({ filter: r => r.id === recording.id, all: true });

      return {
        type: "upload",
        recording: recordings[0],
      };
    } catch (error) {
      logger.error("UploadRecording:Failed", {
        error,
        recordingId: recording.id,
        buildId: recording.buildId,
      });
      return {
        type: "upload",
        recording,
        error: new Error(getErrorMessage(error)),
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

    logger.info("GetRecordingsForTest:FoundRecordings", {
      recoridngsLength: recordings.length,
      filter,
    });

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
    logger.info("SetRecordingMetadata:Started", {
      recordingIds: recordings.map(r => r.id),
      errorLength: this._errors.length,
    });

    mixpanelAPI.trackEvent("test-suite.metadata", {
      numErrors: this._errors.length,
      numRecordings: recordings.length,
      replayTitle,
      extraMetadata,
    });

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
    } catch (error) {
      logger.error("SetRecordingMetadata:GenerateSourceMetadataFailed", {
        error,
      });
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
        logger.info("EnqueuePostTestWork:WillSkipAddTests");
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
    } catch (error) {
      logger.error("EnqueuePostTestWork:Failed", { error });
      return {
        type: "post-test",
        error: new Error(`Error setting metadata and uploading replays: ${getErrorMessage(error)}`),
      };
    }
  }

  private _storeUploadableTestResults(
    results: UploadableTestExecutionResult<TRecordingMetadata>[]
  ) {
    if (this._uploadStatusThreshold === "none" || !this._apiKey) {
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
          aggregateStatus: undefined,
          didUploadStatuses: {
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
    if (this._uploadStatusThreshold === "none" || !this._apiKey) {
      return;
    }
    const executions = result.executions[executionGroupId];
    const latestExecution = last(executions);
    assert(!!latestExecution, "Expected at least one execution in the list");

    let toUpload: typeof executions = [];

    const aggregateStatus = this._assignAggregateStatus(result, executions);

    switch (aggregateStatus) {
      case "failed": {
        if (!this._minimizeUploads) {
          result.didUploadStatuses.failed = true;
          toUpload.push(...executions);
          break;
        }
        if (result.didUploadStatuses.failed) {
          break;
        }
        result.didUploadStatuses.failed = true;
        toUpload.push(latestExecution);
        break;
      }
      case "flaky": {
        if (this._uploadStatusThreshold === "failed") {
          break;
        }
        if (!this._minimizeUploads) {
          result.didUploadStatuses.failed ||= executions.some(r => r.result !== "passed");
          result.didUploadStatuses.passed ||= executions.some(r => r.result === "passed");

          // currently previously completed execution groups that could be entirely passed or failed are not retroactively uploaded here
          toUpload.push(...executions);

          // fallthrough so we don't miss the other status when the flake was detected across different execution groups
        }

        if (!result.didUploadStatuses.failed) {
          const failedExecution = Object.values(result.executions)
            .flatMap(e => e)
            .find(r => r.result !== "passed");

          if (failedExecution) {
            result.didUploadStatuses.failed = true;
            toUpload.push(failedExecution);
          }
        }

        if (!result.didUploadStatuses.passed) {
          const passedExecution = Object.values(result.executions)
            .flatMap(e => e)
            .find(r => r.result === "passed");

          if (passedExecution) {
            result.didUploadStatuses.failed = true;
            toUpload.push(passedExecution);
          }
        }
        break;
      }
      case "passed": {
        if (this._uploadStatusThreshold !== "all") {
          break;
        }
        if (!this._minimizeUploads) {
          result.didUploadStatuses.passed = true;
          toUpload.push(...executions);
          break;
        }
        if (result.didUploadStatuses.passed) {
          break;
        }
        result.didUploadStatuses.passed = true;
        toUpload.push(latestExecution);
        break;
      }
    }

    this._pendingWork.push(
      ...toUpload.flatMap(result => result.recordings).map(r => this._uploadRecording(r))
    );
  }

  private _assignAggregateStatus(
    result: UploadableTestResult<TRecordingMetadata>,
    newExecutions: UploadableTestExecutionResult<TRecordingMetadata>[]
  ) {
    if (!result.aggregateStatus) {
      const latestExecution = last(newExecutions);
      assert(latestExecution, "Expected at least one execution in the list");
      result.aggregateStatus =
        latestExecution.result !== "passed"
          ? "failed"
          : newExecutions.length > 1
          ? "flaky"
          : "passed";
      return result.aggregateStatus;
    }

    switch (result.aggregateStatus) {
      case "passed":
        if (newExecutions.some(r => r.result !== "passed")) {
          result.aggregateStatus = "flaky";
        }
        return result.aggregateStatus;
      case "failed":
        if (newExecutions.some(r => r.result === "passed")) {
          result.aggregateStatus = "flaky";
        }
        return result.aggregateStatus;
      case "flaky":
        return result.aggregateStatus;
    }
  }

  async onEnd(): Promise<PendingWork[]> {
    logger.info("OnEnd:Started");

    mixpanelAPI.trackEvent("test-suite.ending", {
      minimizeUploads: this._minimizeUploads,
      numPendingWork: this._pendingWork.length,
      uploadStatusThreshold: this._uploadStatusThreshold,
    });

    await this._cacheAuthIdsPromise?.catch(error => {
      logger.error("OnEnd:AddingLoggerAuthFailed", {
        error,
      });
    });

    const output: string[] = [];
    let completedWork: PromiseSettledResult<PendingWork | undefined>[] = [];

    if (this._pendingWork.length) {
      log("Finishing up. This should only take a moment ...");
    }

    while (this._pendingWork.length) {
      const pendingWork = this._pendingWork;
      logger.info("OnEnd:PendingWork", { pendingWorkLength: pendingWork.length });
      this._pendingWork = [];
      completedWork.push(...(await Promise.allSettled(pendingWork)));
    }

    if (this._apiKey) {
      const postSettledWork = await Promise.allSettled([this._completeTestRunShard()]);
      completedWork.push(...postSettledWork);
    } else {
      logger.info("OnEnd:WillSkipCompletingTestRun");
    }

    const failures = completedWork.filter(r => r.status === "rejected");

    if (failures.length > 0) {
      output.push("Encountered unexpected errors while processing replays");
      failures.forEach(f => output.push(`  ${f.reason}`));
    }

    const results = completedWork.map(r => r.status === "fulfilled" && r.value).filter(r => !!r);

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

    let numCrashed = 0;
    let numUploaded = 0;

    if (uploads.length > 0) {
      const recordingIds = uploads.map(u => u.recordingId).filter(isNonNullable);
      for (const recordingId of recordingIds) {
        removeRecording(recordingId);
      }

      const uploaded = uploads.filter(u => u.status === "uploaded");
      const crashed = uploads.filter(u => u.status === "crashUploaded");

      numCrashed = crashed.length;
      numUploaded = uploaded.length;

      if (uploaded.length > 0) {
        output.push(`\n🚀 Successfully uploaded ${uploads.length} recordings:`);
        const sortedUploads = sortRecordingsByResult(uploads);
        sortedUploads.forEach(r => {
          output.push(
            `\n   ${getTestResultEmoji(r)} ${(r.metadata.title as string | undefined) || "Unknown"}`
          );
          output.push(
            `      ${process.env.REPLAY_VIEW_HOST || "https://app.replay.io"}/recording/${r.id}`
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

    mixpanelAPI.trackEvent("test-suite.results", {
      errors,
      numCrashed,
      numUploaded,
    });

    if (output.length > 0) {
      log(output.join("\n"));
    }

    return results;
  }
}
