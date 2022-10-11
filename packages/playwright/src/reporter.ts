import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import path from "path";

import { ReplayReporter, ReplayReporterConfig } from "@replayio/test-utils";

import { getMetadataFilePath } from "./index";
import { readFileSync } from "fs";
import { Step } from "@replayio/test-utils/src/reporter";
const removeAnsiCodes =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

const fileCache = new Map<string, string[]>();
function readLines(fileName: string) {
  if (!fileCache.has(fileName)) {
    const lines = readFileSync(fileName).toString().split("\n");
    fileCache.set(fileName, lines);
  }

  return fileCache.get(fileName)!;
}

class ReplayPlaywrightReporter implements Reporter {
  reporter?: ReplayReporter;
  rootDir?: string;

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
    this.rootDir = config.rootDir;
    this.reporter = new ReplayReporter({ name: "playwright", version: config.version });
    this.reporter.onTestSuiteBegin(this.parseConfig(config), "PLAYWRIGHT_REPLAY_METADATA");
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.reporter?.onTestBegin(this.getTestId(test), getMetadataFilePath(testResult.workerIndex));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    const steps = result.steps.map<Step>(step => {
      const lines = step.location ? readLines(step.location.file) : undefined;
      return {
        title: step.title,
        location: step.location
          ? {
              ...step.location,
              // we don't need or want the user's full path so shortening to the
              // path relative to the project root directory
              file: path.relative(this.rootDir!, step.location.file),
            }
          : undefined,
        error:
          step.error?.message && lines
            ? {
                message: step.error.message.replace(removeAnsiCodes, ""),
                lines: lines.slice(Math.max(0, step.location!.line - 3), step.location!.line + 3),
              }
            : undefined,
      };
    });

    this.reporter?.onTestEnd({
      id: this.getTestId(test),
      title: test.title,
      path: test.titlePath(),
      result: status,
      relativePath: test.titlePath()[2] || test.location.file,
      steps,
    });
  }
}

export default ReplayPlaywrightReporter;
