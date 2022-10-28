import type {
  FullConfig,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import path from "path";

import { ReplayReporter, ReplayReporterConfig, removeAnsiCodes } from "@replayio/test-utils";

import { getMetadataFilePath } from "./index";

function extractErrorMessage(errorStep?: TestStep) {
  const errorMessageLines = removeAnsiCodes(errorStep?.error?.message)?.split("\n");
  let stackStart = errorMessageLines?.findIndex(l => l.startsWith("Call log:"));
  stackStart = stackStart == null || stackStart === -1 ? 10 : Math.min(stackStart, 10);
  return stackStart == null ? undefined : errorMessageLines?.slice(0, stackStart).join("\n");
}

class ReplayPlaywrightReporter implements Reporter {
  reporter?: ReplayReporter;
  startTime?: number;

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
    this.reporter = new ReplayReporter({ name: "playwright", version: config.version });
    this.reporter.onTestSuiteBegin(this.parseConfig(config), "PLAYWRIGHT_REPLAY_METADATA");
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.startTime = Date.now();
    this.reporter?.onTestBegin(this.getTestId(test), getMetadataFilePath(testResult.workerIndex));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    const errorStep = result.steps.find(step => step.error?.message);
    const errorMessage = extractErrorMessage(errorStep);

    this.reporter?.onTestEnd(
      [
        {
          id: this.getTestId(test),
          title: test.title,
          path: test.titlePath(),
          result: status,
          relativePath: test.titlePath()[2] || test.location.file,
          error: errorMessage
            ? {
                message: errorMessage,
                line: errorStep?.location?.line,
                column: errorStep?.location?.column,
              }
            : undefined,
          steps: result.steps.map(s => {
            const stepErrorMessage = extractErrorMessage(s);
            return {
              name: s.title,
              error: stepErrorMessage
                ? {
                    message: stepErrorMessage,
                    line: s.location?.line,
                    column: s.location?.column,
                  }
                : undefined,
              relativeStartTime: this.startTime
                ? s.startTime.getTime() - this.startTime
                : undefined,
              duration: s.duration,
            };
          }),
        },
      ],
      test.title
    );
  }
}

export default ReplayPlaywrightReporter;
