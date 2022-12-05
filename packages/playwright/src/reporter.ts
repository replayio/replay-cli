import type {
  FullConfig,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import path from "path";

import {
  ReplayReporter,
  ReplayReporterConfig,
  removeAnsiCodes,
  TestStep as ReplayTestStep,
} from "@replayio/test-utils";

import { getMetadataFilePath } from "./index";
import { readFileSync } from "fs";

const pluginVersion = require("../package.json").version;

function extractErrorMessage(errorStep?: TestStep) {
  const errorMessageLines = removeAnsiCodes(errorStep?.error?.message)?.split("\n");
  let stackStart = errorMessageLines?.findIndex(l => l.startsWith("Call log:"));
  stackStart = stackStart == null || stackStart === -1 ? 10 : Math.min(stackStart, 10);
  return stackStart == null ? undefined : errorMessageLines?.slice(0, stackStart).join("\n");
}

function mapTestStepCategory(step: TestStep): ReplayTestStep["category"] {
  switch (step.category) {
    case "expect":
      return "assertion";
    case "step":
    case "pw:api":
      return "command";
    default:
      return "other";
  }
}

function mapTestStepHook(step: TestStep): ReplayTestStep["hook"] {
  if (step.category !== "hook") return;

  switch (step.title) {
    case "Before Hooks":
      return "beforeEach";
    case "After Hooks":
      return "afterEach";
  }
}

interface ReplayPlaywrightConfig extends ReplayReporterConfig {
  captureTestFile?: boolean;
}

class ReplayPlaywrightReporter implements Reporter {
  reporter?: ReplayReporter;
  startTime?: number;
  captureTestFile = true;

  getTestId(test: TestCase) {
    return test.titlePath().join("-");
  }

  parseConfig(config: FullConfig) {
    let cfg: ReplayPlaywrightConfig = {};
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
    const cfg = this.parseConfig(config);
    this.reporter = new ReplayReporter({
      name: "playwright",
      version: config.version,
      plugin: pluginVersion,
    });
    this.reporter.onTestSuiteBegin(cfg, "PLAYWRIGHT_REPLAY_METADATA");

    if (cfg.captureTestFile === false) {
      this.captureTestFile = false;
    }
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

    const relativePath = test.titlePath()[2] || test.location.file;
    let playwrightMetadata: Record<string, any> | undefined;

    if (this.captureTestFile) {
      try {
        playwrightMetadata = {
          "x-replay-playwright": {
            sources: {
              [relativePath]: readFileSync(relativePath, "utf8").toString(),
            },
          },
        };
      } catch (e) {
        console.warn("Failed to read playwright test source from " + test.location.file);
        console.warn(e);
      }
    }

    this.reporter?.onTestEnd(
      [
        {
          id: this.getTestId(test),
          title: test.title,
          path: test.titlePath(),
          result: status,
          relativePath,
          error: errorMessage
            ? {
                message: errorMessage,
                line: errorStep?.location?.line,
                column: errorStep?.location?.column,
              }
            : undefined,
          steps: result.steps.map((s, i) => {
            const stepErrorMessage = extractErrorMessage(s);
            return {
              id: String(i),
              name: s.title,
              error: stepErrorMessage
                ? {
                    message: stepErrorMessage,
                    line: s.location?.line,
                    column: s.location?.column,
                  }
                : undefined,
              relativeStartTime: this.startTime
                ? Math.max(0, s.startTime.getTime() - this.startTime)
                : undefined,
              duration: s.duration,
              hook: mapTestStepHook(s),
              category: mapTestStepCategory(s),
            };
          }),
        },
      ],
      test.title,
      playwrightMetadata
    );
  }
}

export default ReplayPlaywrightReporter;
