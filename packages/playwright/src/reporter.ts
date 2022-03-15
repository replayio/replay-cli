import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { getDirectory } from "@recordreplay/recordings-cli/src/utils";
import { listAllRecordings } from "@recordreplay/recordings-cli";
import { appendFileSync } from "fs";
import path from "path";

class ReplayReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (!["passed", "failed"].includes(result.status)) return;

    const last = listAllRecordings().pop();
    if (last) {
      const metadata = {
        id: last.id,
        kind: "addMetadata",
        metadata: {
          title: `[${result.status.toUpperCase()}] - ${test.title}`,
          testStatus: result.status,
        },
        timestamp: Date.now(),
      };

      appendFileSync(
        path.join(getDirectory(), "recordings.log"),
        `\n${JSON.stringify(metadata)}\n`
      );
    }
  }
}

export default ReplayReporter;
