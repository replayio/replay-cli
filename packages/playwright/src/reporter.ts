import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import path from "path";

import { ReplayReporter, ReplayReporterConfig } from "@replayio/test-utils";

import { getMetadataFilePath } from "./index";

class ReplayPlaywrightReporter implements Reporter {
  reporter = new ReplayReporter();

  getTestId(test: TestCase) {
    return test.titlePath().join("-");
  }

  parseConfig(config: FullConfig) {
    let cfg: ReplayReporterConfig = {};
    config.reporter.forEach(r => {
      // the reporter is imported from the root reporter.js which imports this
      // file so we compare the base directory to see if this is our config
      if (r[0].startsWith(path.resolve(__dirname, ".."))) {
        if (r[1]) {
          if (typeof r[1] === "object") {
            cfg = r[1];
          } else {
            console.warn(
              "Expected an object for @replayio/playwright/reporter configuration but received",
              typeof r[1]
            );
          }
        }
      }
    });

    return cfg;
  }

  onBegin(config: FullConfig) {
    this.reporter.onTestSuiteBegin(this.parseConfig(config), "PLAYWRIGHT_REPLAY_METADATA");
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.reporter.onTestBegin(this.getTestId(test), getMetadataFilePath(testResult.workerIndex));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    this.reporter.onTestEnd({
      id: this.getTestId(test),
      title: test.title,
      path: test.titlePath(),
      result: status,
      relativePath: test.titlePath()[2] || test.location.file,
    });
  }
}

export default ReplayPlaywrightReporter;
