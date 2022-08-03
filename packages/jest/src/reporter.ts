import { writeFileSync } from "fs";
import path from "path";
import type { Reporter, Test, ReporterOnStartOptions, Context, Config } from "@jest/reporters";
import type { AggregatedResult, TestResult } from "@jest/test-result";
import { listAllRecordings } from "@replayio/replay";
import { add, test as testMetadata } from "@replayio/replay/metadata";
const uuid = require("uuid");

import { getMetadataFilePath } from "./index";

class ReplayReporter implements Reporter {
  runId = uuid.validate(
    process.env.RECORD_REPLAY_METADTA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID || ""
  )
    ? process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  runTitle = process.env.RECORD_REPLAY_METADTA_TEST_RUN_TITLE || "";
  baseMetadata: Record<string, any> | null = null;

  constructor(_globalConfig: Config.GlobalConfig, options: any) {
    this.setBaseMetadata(options.metadata);
  }

  setBaseMetadata(metadata?: Record<string, any>) {
    // RECORD_REPLAY_METADATA is our "standard" metadata environment variable.
    // We suppress it for the browser process so we can use
    // RECORD_REPLAY_METADATA_FILE but can still use the metadata here which
    // runs in the test runner process. However, playwright's convention for
    // reporter-specific environment configuration is to prefix with PLAYWRIGHT_
    // so we use that as the first priority, RECORD_REPLAY_METADATA second, and
    // the config value last.
    if (process.env.JEST_REPLAY_METADATA && process.env.RECORD_REPLAY_METADATA) {
      console.warn(
        "Cannot set metadata via both RECORD_REPLAY_METADATA and JEST_REPLAY_METADATA. Using JEST_REPLAY_METADATA."
      );
    }

    const baseMetadata =
      process.env.JEST_REPLAY_METADATA || process.env.RECORD_REPLAY_METADATA || metadata || null;
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

  getTestId(test: Test) {
    return `${this.runId}-${test.path}`;
  }

  onTestStart(test: Test) {
    const workerIndex = +(process.env.JEST_WORKER_ID || 0);
    const metadataFilePath = getMetadataFilePath(workerIndex);

    writeFileSync(
      metadataFilePath,
      JSON.stringify(
        {
          "x-jest": {
            id: this.getTestId(test),
          },
        },
        undefined,
        2
      ),
      {}
    );

    process.env.RECORD_REPLAY_METADATA_FILE = metadataFilePath;
  }

  onTestResult(test: Test, testResult: TestResult) {
    if (testResult.numPassingTests === 0 && testResult.numFailingTests === 0) return;

    const total = testResult.testResults.length;
    const allPassed = testResult.numPassingTests === total;

    const status = allPassed ? "passed" : "failed";

    const relativePath = path.relative(test.context.config.cwd, test.path);
    const title =
      testResult.testResults.length === 1 ? testResult.testResults[0].title : relativePath;

    const recs = listAllRecordings().filter(r => {
      if (r.metadata["x-jest"] && typeof r.metadata["x-jest"] === "object") {
        return (r.metadata["x-jest"] as any).id === this.getTestId(test);
      }

      return false;
    });

    if (recs.length > 0) {
      recs.forEach(rec =>
        add(rec.id, {
          title,
          ...this.baseMetadata,
          ...testMetadata.init({
            title,
            result: status,
            path: ["", "jest", relativePath, title],
            run: {
              id: this.runId,
              title: this.runTitle,
            },
            file: relativePath,
          }),
        })
      );
    }
  }

  onRunStart(_results: AggregatedResult, _options: ReporterOnStartOptions): Promise<void> | void {}

  onRunComplete(_contexts: Set<Context>, _results: AggregatedResult): Promise<void> | void {}

  getLastError() {}
}

export default ReplayReporter;
