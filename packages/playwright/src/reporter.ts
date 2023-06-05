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
  UserActionEvent,
  getMetadataFilePath as getMetadataFilePathBase,
} from "@replayio/test-utils";

import { readFileSync } from "fs";

const pluginVersion = require("../package.json").version;

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("PLAYWRIGHT", workerIndex);
}

function extractErrorMessage(errorStep?: TestStep) {
  const errorMessageLines = removeAnsiCodes(errorStep?.error?.message)?.split("\n");
  let stackStart = errorMessageLines?.findIndex(l => l.startsWith("Call log:"));
  stackStart = stackStart == null || stackStart === -1 ? 10 : Math.min(stackStart, 10);
  return stackStart == null ? undefined : errorMessageLines?.slice(0, stackStart).join("\n");
}

function mapTestStepCategory(step: TestStep): UserActionEvent["data"]["category"] {
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

function mapTestStepHook(step: TestStep): "beforeEach" | "afterEach" | undefined {
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
  captureTestFile = ["1", "true"].includes(
    process.env.PLAYWRIGHT_REPLAY_CAPTURE_TEST_FILE?.toLowerCase() || "true"
  );

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
    this.reporter = new ReplayReporter(
      {
        name: "playwright",
        version: config.version,
        plugin: pluginVersion,
      },
      "2.0.0"
    );
    this.reporter.onTestSuiteBegin(cfg, "PLAYWRIGHT_REPLAY_METADATA");

    if (cfg.captureTestFile === false) {
      this.captureTestFile = false;
    }
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.startTime = Date.now();
    this.reporter?.onTestBegin(
      { title: test.title, scope: test.titlePath() },
      getMetadataFilePath(testResult.workerIndex)
    );
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const duration = Date.now() - this.startTime!;
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    const errorStep = result.steps.find(step => step.error?.message);
    const errorMessage = extractErrorMessage(errorStep);

    const relativePath = test.titlePath()[2];
    let playwrightMetadata: Record<string, any> | undefined;

    if (this.captureTestFile) {
      try {
        playwrightMetadata = {
          "x-replay-playwright": {
            sources: {
              [relativePath]: readFileSync(test.location.file, "utf8").toString(),
            },
          },
        };
      } catch (e) {
        console.warn("Failed to read playwright test source from " + test.location.file);
        console.warn(e);
      }
    }

    const hookMap = new Map<"beforeEach" | "afterEach", UserActionEvent[]>();
    const steps: UserActionEvent[] = [];
    for (let [i, s] of result.steps.entries()) {
      const hook = mapTestStepHook(s);
      const stepErrorMessage = extractErrorMessage(s);
      const step: UserActionEvent = {
        data: {
          id: String(i),
          parentId: null,
          command: {
            name: s.title,
            arguments: [],
          },
          scope: s.titlePath(),
          error: stepErrorMessage
            ? {
                name: "AssertionError",
                message: stepErrorMessage,
                line: s.location?.line,
                column: s.location?.column,
              }
            : null,
          category: mapTestStepCategory(s),
        },
      };

      if (hook) {
        const hookSteps = hookMap.get(hook) || [];
        hookSteps.push(step);
        hookMap.set(hook, hookSteps);
      } else {
        steps.push(step);
      }
    }

    // const hooks: UserActionEvent[] = [];
    // for (let e of hookMap.entries()) {
    //   hooks.push({
    //     title: e[0],
    //     // TODO [ryanjduffy]: Fix this before landing ... this isn't handling
    //     // hooks at multiple levels yet
    //     path: [],
    //     steps: e[1],
    //   });
    // }

    // this.reporter?.onTestEnd(
    //   [
    //     {
    //       id: this.getTestId(test),
    //       title: test.title,
    //       path: test.titlePath(),
    //       result: status,
    //       relativePath,
    //       error: errorMessage
    //         ? {
    //             message: errorMessage,
    //             line: errorStep?.location?.line,
    //             column: errorStep?.location?.column,
    //           }
    //         : undefined,
    //       steps: steps,
    //     },
    //   ],
    //   hooks,
    //   test.title,
    //   playwrightMetadata
    // );
  }
}

export default ReplayPlaywrightReporter;
