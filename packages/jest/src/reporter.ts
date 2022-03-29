import type {
  Reporter,
  Test,
  ReporterOnStartOptions,
  Context,
} from "@jest/reporters";
import type { AggregatedResult, TestResult } from "@jest/test-result";
import { getDirectory } from "@replayio/replay/src/utils";
import { listAllRecordings } from "@replayio/replay";
import { appendFileSync } from "fs";
import path from "path";

class ReplayReporter implements Reporter {
  onTestFileResult?(_test: Test, testResult: TestResult): Promise<void> | void {
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

    const last = listAllRecordings().pop();
    if (last) {
      const metadata = {
        id: last.id,
        kind: "addMetadata",
        metadata: {
          title: `[${status.toUpperCase()}] - ${testResult.displayName}`,
          testStatus: status,
        },
        timestamp: Date.now(),
      };

      appendFileSync(
        path.join(getDirectory(), "recordings.log"),
        `\n${JSON.stringify(metadata)}\n`
      );
    }
  }
  // onTestCaseResult? (
  //   test: Test,
  //   testCaseResult: TestCaseResult,
  // ): Promise<void> | void {

  // }
  onRunStart(
    _results: AggregatedResult,
    _options: ReporterOnStartOptions
  ): Promise<void> | void {}
  // onTestStart? (test: Test): Promise<void> | void {

  // }
  // onTestFileStart? (test: Test): Promise<void> | void {

  // }
  onRunComplete(
    _contexts: Set<Context>,
    _results: AggregatedResult
  ): Promise<void> | void {}
  getLastError() {}
}

export default ReplayReporter;
