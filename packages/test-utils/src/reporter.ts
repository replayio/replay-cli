import { listAllRecordings } from "@replayio/replay";
import { add, test as testMetadata } from "@replayio/replay/metadata";
import { writeFileSync } from "fs";
import dbg from "debug";
const uuid = require("uuid");

import { getMetadataFilePath } from "./metadata";
import { pingTestMetrics } from "./metrics";

const debug = dbg("replay:test-utils:reporter");

export interface ReplayReporterConfig {
  runTitle?: string;
  metadata?: Record<string, any> | string;
}

export interface TestError {
  message: string;
  name?: string;
  line?: number;
  column?: number;
}

export interface TestStep {
  id: string;
  path: string[];
  parentId?: string;
  name: string;
  args?: any[];
  error?: TestError;
  relativeStartTime?: number;
  duration?: number;
  hook?: "beforeEach" | "afterEach" | "beforeAll" | "afterAll";
  category: "command" | "assertion" | "other";
  // Links an assert to the triggering command
  commandId?: string;
  assertIds?: string[];
}

export interface Hook {
  title: string;
  path: string[];
  steps?: TestStep[];
}

export interface Test {
  id?: string;
  title: string;
  path: string[];
  result: "passed" | "failed" | "timedOut" | "skipped" | "unknown";
  relativePath: string;
  error?: TestError;
  steps: TestStep[];
  relativeStartTime?: number;
  duration?: number;
}

export interface TestRunner {
  name?: string;
  version?: string;
  plugin?: string;
}

function parseRuntime(runtime?: string) {
  return ["chromium", "gecko", "node"].find(r => runtime?.includes(r));
}

export class ReporterError extends Error {
  code: number;
  testId?: string;
  detail?: any;

  constructor(code: number, message: string, testId?: string, detail?: any) {
    super();

    this.name = "ReporterError";
    this.code = code;
    this.message = message;
    this.testId = testId;
    this.detail = detail;
  }

  valueOf() {
    return {
      name: this.name,
      message: this.message,
      test: this.testId,
      detail: this.detail,
    };
  }
}

class ReplayReporter {
  baseId = uuid.validate(
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID || ""
  )
    ? process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  baseMetadata: Record<string, any> | null = null;
  runTitle?: string;
  startTimes: Record<string, number> = {};
  runner?: TestRunner;
  errors: (string | Error | ReporterError)[] = [];

  constructor(runner?: TestRunner) {
    this.runner = runner;
  }

  getTestId(testId?: string) {
    if (!testId) {
      return this.baseId;
    }

    return `${this.baseId}-${testId}`;
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

  addError(err: Error) {
    if (err.name === "ReporterError") {
      this.errors.push(err);
    } else {
      this.errors.push(new ReporterError(-1, "Unexpected error", undefined, err));
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

  onTestBegin(testId?: string, metadataFilePath = getMetadataFilePath("REPLAY_TEST", 0)) {
    this.errors = [];
    this.startTimes[this.getTestId(testId)] = Date.now();
    const metadata = {
      ...(this.baseMetadata || {}),
      "x-replay-test": {
        id: this.getTestId(testId),
      },
    };

    debug("onTestBegin: Writing metadata to %s: %o", metadataFilePath, metadata);

    writeFileSync(metadataFilePath, JSON.stringify(metadata, undefined, 2), {});
  }

  onTestEnd(
    tests: Test[],
    hooks?: Hook[],
    replayTitle?: string,
    extraMetadata?: Record<string, unknown>
  ) {
    // if we bailed building test metadata because of a crash or because no
    // tests ran, we can bail here too
    if (tests.length === 0) {
      debug("onTestEnd: No tests found");
      return;
    }

    const filter = `function($v) { $v.metadata.\`x-replay-test\`.id in ${JSON.stringify(
      tests.map(test => this.getTestId(test.id))
    )} and $not($exists($v.metadata.test)) }`;

    const recs = listAllRecordings({
      filter,
    });

    debug("onTestEnd: Found %d recs with filter %s", recs.length, filter);

    const test = tests[0];
    const results = tests.reduce<Test["result"][]>(
      (acc, t) => (acc.includes(t.result) ? acc : [...acc, t.result]),
      []
    );
    const result =
      results.length === 1
        ? results[0]
        : results.includes("failed")
        ? "failed"
        : results.includes("timedOut")
        ? "timedOut"
        : "passed";

    let recordingId: string | undefined;
    let runtime: string | undefined;
    if (recs.length > 0) {
      recordingId = recs[0].id;
      runtime = recs[0].runtime;

      debug("onTestEnd: Adding test metadata to %s", recordingId);
      debug("onTestEnd: Includes %s errors", this.errors.length);

      recs.forEach(rec =>
        add(rec.id, {
          title: replayTitle || test.title,
          ...extraMetadata,
          ...testMetadata.init({
            title: replayTitle || test.title,
            result,
            path: test.path,
            runner: this.runner,
            run: {
              id: this.baseId,
              title: this.runTitle,
            },
            file: test.relativePath,
            hooks: hooks,
            tests: tests,
            reporterErrors: this.errors,
          }),
        })
      );
    }

    const startTime = this.startTimes[this.getTestId(test.id)];
    if (startTime) {
      pingTestMetrics(recordingId, this.baseId, {
        id: test.id || test.relativePath,
        duration: Date.now() - startTime,
        recorded: !!recordingId,
        runtime: parseRuntime(runtime),
        runner: this.runner?.name,
        result: result,
      });
    }
  }
}

export default ReplayReporter;
