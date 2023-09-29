import { RecordingEntry, listAllRecordings } from "@replayio/replay";
import { add, test as testMetadata, source as sourceMetadata } from "@replayio/replay/metadata";
import type { TestMetadataV1, TestMetadataV2 } from "@replayio/replay/metadata/test";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import dbg from "debug";
const uuid = require("uuid");

import { getMetadataFilePath } from "./metadata";
import { pingTestMetrics } from "./metrics";
import { warn } from "./logging";

const debug = dbg("replay:test-utils:reporter");

export interface ReplayReporterConfig {
  runTitle?: string;
  metadata?: Record<string, any> | string;
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

type PendingWork = {
  type: "recording";
  recordings: RecordingEntry[];
};

class ReplayReporter {
  baseId = uuid.validate(
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID || ""
  )
    ? process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  baseMetadata: Record<string, any> | null = null;
  schemaVersion: string;
  runTitle?: string;
  runner: TestRunner;
  errors: ReporterError[] = [];
  apiKey?: string;
  pendingWork: Promise<PendingWork>[] = [];

  constructor(runner: TestRunner, schemaVersion: string) {
    this.runner = runner;
    this.schemaVersion = schemaVersion;
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
  }

  onTestBegin(source?: Test["source"], metadataFilePath = getMetadataFilePath("REPLAY_TEST", 0)) {
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
    // if we bailed building test metadata because of a crash or because no
    // tests ran, we can bail here too
    if (tests.length === 0) {
      debug("onTestEnd: No tests found");
      return;
    }

    this.pendingWork.push(this.addMetadata(tests, specFile, replayTitle, extraMetadata));
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
        const validatedSourceMetadata = sourceMetadata.init();
        mergedMetadata = {
          ...mergedMetadata,
          ...validatedSourceMetadata,
        };
      } catch (e) {
        debug("Failed to generate source metadata", e);
      }

      recordings.forEach(rec => add(rec.id, mergedMetadata));
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
        filter,
      }),
    };
  }

  async onEnd() {
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
