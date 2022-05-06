import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { getDirectory } from "@replayio/replay/src/utils";
import { listAllRecordings } from "@replayio/replay";
import { test as testMetadata } from "@replayio/replay/metadata";
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
            "x-playwright": {
              id: this.getTestId(test),
            },
          },
          undefined,
          2
        ),
        {}
      );
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    if (status !== "passed" && status !== "failed") return;

    const recs = listAllRecordings().filter((r) => {
      if (
        r.metadata["x-playwright"] &&
        typeof r.metadata["x-playwright"] === "object"
      ) {
        return (r.metadata["x-playwright"] as any).id === this.getTestId(test);
      }

      return false;
    });

    if (recs.length > 0) {
      recs.forEach((rec) => {
        const metadata = {
          id: rec.id,
          kind: "addMetadata",
          metadata: {
            title: test.title,
            ...testMetadata.init({
              title: test.title,
              result: status,
              path: test.titlePath(),
              run: "playwright-" + this.baseId,
              // extract the relative path from titlePath() but fall back to the
              // full path
              file: test.titlePath()[2] || test.location.file,
            }),
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
