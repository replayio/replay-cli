import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { getDirectory } from "@replayio/replay/src/utils";
import { listAllRecordings } from "@replayio/replay";
import makeTestMetadata, {TestMetadata} from "@replayio/replay/src/metadata/test";
import { writeFileSync, appendFileSync, existsSync } from "fs";
import path from "path";

import { getMetadataFilePath } from "./index";

class ReplayReporter implements Reporter {
  baseId = Date.now();

  getTestId(test: TestCase) {
    return `${this.baseId}-${test.titlePath().join("-")}`;
  }

  onBegin(config: FullConfig, suite: Suite) {
    // prime all the metadata files
    for (let i = 0; i < config.workers; i++) {
      writeFileSync(getMetadataFilePath(i), "{}");
    }
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    const metadataFilePath = getMetadataFilePath(testResult.workerIndex);
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

  onTestEnd(test: TestCase, result: TestResult) {
    if (!["passed", "failed"].includes(result.status)) return;

    const recs = listAllRecordings().filter(
      (r) => r.metadata.testId === this.getTestId(test)
    );
    if (recs.length > 0) {
      recs.forEach((rec) => {
        const metadata = {
          id: rec.id,
          kind: "addMetadata",
          metadata: {
            title: test.title,
            test: result.status === "skipped" ? null : makeTestMetadata({
              title: test.title,
              result: result.status,
              path: test.titlePath(),
              run: "playwright-" + this.baseId,
              file: test.location.file,
            })
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
}

export default ReplayReporter;
