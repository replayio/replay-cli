import { writeFileSync, appendFileSync, existsSync } from "fs";
import os from "os";
import path from "path";
import type {
  Reporter,
  Test,
  ReporterOnStartOptions,
  Context,
} from "@jest/reporters";
import type { AggregatedResult, TestResult } from "@jest/test-result";
import { listAllRecordings } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";

import { getMetadataFilePath } from "./index";

class ReplayReporter implements Reporter {
  baseId = Date.now();

  getTestId(test: Test) {
    return `${this.baseId}-${test.path}`;
  }

  onTestStart(test: Test) {
    console.log("worker id", process.env.JEST_WORKER_ID);
    const workerIndex = +(process.env.JEST_WORKER_ID || 0);
    const metadataFilePath = getMetadataFilePath(workerIndex);
    if (existsSync(metadataFilePath)) {
      writeFileSync(
        metadataFilePath,
        JSON.stringify(
          {
            testId: this.getTestId(test),
          },
          undefined,
          2
        ),
        {}
      );
    }
  }

  onTestResult(
    test: Test,
    testResult: TestResult,
  ) {
    const [passed, failed] = testResult.testResults.reduce<number[]>(
      (acc, result) => {
        switch (result.status) {
          case "passed":
            acc[0]++;
            break;
          case "failed":
            acc[1]++;
            break;
        }

        return acc;
      },
      [0, 0]
    );

    if (passed === 0 && failed === 0) return;

    const total = testResult.testResults.length;
    const allPassed = passed === total;

    const status = allPassed ? "passed" : "failed";

    const recs = listAllRecordings().filter(
      (r) => r.metadata.testId === this.getTestId(test)
    );
    if (recs.length > 0) {
      recs.forEach((rec) => {
        const metadata = {
          id: rec.id,
          kind: "addMetadata",
          metadata: {
            title: testResult.displayName,
            testStatus: status,
          },
          timestamp: Date.now(),
        };

        appendFileSync(
          path.join(getDirectory(), "recordings.log"),
          `\n${JSON.stringify(metadata)}\n`
        );
      });
    }
  }

  onRunStart(
    _results: AggregatedResult,
    _options: ReporterOnStartOptions
  ): Promise<void> | void {
    // prime all the metadata files
    const maxWorkers = os.cpus().length;
    for (let i = 0; i < maxWorkers; i++) {
      writeFileSync(getMetadataFilePath(i), "{}");
    }
  }

  onRunComplete(
    _contexts: Set<Context>,
    _results: AggregatedResult
  ): Promise<void> | void {}

  getLastError() {}
}

export default ReplayReporter;
