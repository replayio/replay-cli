import type {
  FullConfig,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";
import { emphasize, highlight, link } from "@replay-cli/shared/theme";
import {
  ReplayReporter,
  ReplayReporterConfig,
  TestMetadataV2,
  getMetadataFilePath as getMetadataFilePathBase,
  removeAnsiCodes,
} from "@replayio/test-utils";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { WebSocketServer } from "ws";

type UserActionEvent = TestMetadataV2.UserActionEvent;

import { initLogger, logger } from "@replay-cli/shared/logger";
import { getRuntimePath } from "@replay-cli/shared/runtime/getRuntimePath";
import { setUserAgent } from "@replay-cli/shared/userAgent";
import pkgJson from "../package.json";
import { FixtureStepStart, ParsedErrorFrame, TestExecutionIdData } from "./fixture";
import { StackFrame } from "./playwrightTypes";
import { getServerPort, startServer } from "./server";

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("PLAYWRIGHT", workerIndex);
}

function extractErrorMessage(error: TestError) {
  const message = removeAnsiCodes(error.message);
  if (message) {
    // Error message. Set when [Error] (or its subclass) has been thrown.
    const errorMessageLines = message.split("\n");
    let stackStart = errorMessageLines.findIndex(l => l.startsWith("Call log:"));
    stackStart = stackStart == null || stackStart === -1 ? 10 : Math.min(stackStart, 10);
    return errorMessageLines.slice(0, stackStart).join("\n");
  } else if (error.value != null) {
    // The value that was thrown. Set when anything except the [Error] (or its subclass) has been thrown.
    return error.value;
  }

  return "Unknown error";
}

function mapFixtureStepCategory(step: FixtureStep): UserActionEvent["data"]["category"] {
  if (step.apiName.startsWith("expect")) {
    return "assertion";
  }

  return "command";
}

type ReplayPlaywrightRecordingMetadata = {
  title: string;
  test: TestMetadataV2.TestRun;
};

export interface ReplayPlaywrightConfig
  extends ReplayReporterConfig<ReplayPlaywrightRecordingMetadata> {
  captureTestFile?: boolean;
}

interface FixtureStep extends FixtureStepStart {
  error?: ParsedErrorFrame | undefined;
}

// Playwright uses an empty string for anonymous root projects
const ROOT_PROJECT_NAME = "";

class ReplayPlaywrightReporter implements Reporter {
  reporter: ReplayReporter<ReplayPlaywrightRecordingMetadata>;
  captureTestFile: boolean;
  config: ReplayPlaywrightConfig;
  wss: WebSocketServer;
  fixtureData: Record<
    string,
    { steps: FixtureStep[]; stacks: Record<string, StackFrame[]>; filenames: Set<string> }
  > = {};
  private _projects: Record<string, { executed: boolean; usingReplay: boolean }> = {};

  constructor(config: ReplayPlaywrightConfig) {
    setUserAgent(`${pkgJson.name}/${pkgJson.version}`);
    initLogger(pkgJson.name, pkgJson.version);
    if (!config || typeof config !== "object") {
      throw new Error(
        `Expected an object for @replayio/playwright/reporter configuration but received: ${config}`
      );
    }

    this.config = config;
    this.reporter = new ReplayReporter(
      {
        name: "playwright",
        version: undefined,
        plugin: pkgJson.version,
      },
      "2.2.0",
      { ...this.config, metadataKey: "PLAYWRIGHT_REPLAY_METADATA" }
    );
    this.captureTestFile =
      "captureTestFile" in config
        ? !!config.captureTestFile
        : ["1", "true"].includes(
            process.env.PLAYWRIGHT_REPLAY_CAPTURE_TEST_FILE?.toLowerCase() || "true"
          );
    const port = getServerPort();
    this.wss = startServer({
      port,
      onStepStart: (test, step) => {
        const { steps } = this.getFixtureData(test);
        steps.push(step);
      },
      onStepEnd: (test, step) => {
        if (!step.error) {
          return;
        }
        const { steps } = this.getFixtureData(test);
        const s = steps.find(f => f.id === step.id);

        if (s) {
          s.error = step.error;
        }
      },
      onError: (_test, error) => {
        this.reporter?.addError(error);
      },
    });
  }

  getFixtureData(test: TestExecutionIdData) {
    const id = this._getTestExecutionId(test);
    this.fixtureData[id] ??= {
      steps: [],
      stacks: {},
      filenames: new Set(),
    };

    return this.fixtureData[id];
  }

  // Playwright alrady provides a unique test id:
  // https://github.com/microsoft/playwright/blob/6fb214de2378a9d874b46df6ea99d04da5765cba/packages/playwright/src/common/suiteUtils.ts#L56-L57
  // this is different because it includes `repeatEachIndex` and `attempt`
  // TODO(PRO-667): this could be simplified to `${test.testId}-${test.repeatEachIndex}-${test.attempt}`
  // before doing that all recipients of `TestExecutionIdData` should be rechecked to see if such a change would be safe
  private _getTestExecutionId(test: TestExecutionIdData) {
    return [
      test.filePath,
      test.projectName ?? "",
      test.repeatEachIndex,
      test.attempt,
      ...test.source.scope,
      test.source.title,
    ].join("-");
  }

  getSource(test: TestCase) {
    return {
      title: test.title,
      scope: test.titlePath().slice(3, -1),
    };
  }

  onBegin({ version, projects }: FullConfig) {
    const replayBrowserPath = getRuntimePath();
    for (const project of projects) {
      this._projects[project.name] = {
        executed: false,
        usingReplay: project.use.launchOptions?.executablePath === replayBrowserPath,
      };
    }
    this.reporter.setTestRunnerVersion(version);
    this.reporter.onTestSuiteBegin();
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    const projectName = test.parent.project()?.name;

    // it's important to handle the root project's name here and that's an empty string
    if (typeof projectName === "string") {
      this._projects[projectName].executed = true;
    }

    const testExecutionId = this._getTestExecutionId({
      filePath: test.location.file,
      projectName: test.parent.project()?.name,
      repeatEachIndex: test.repeatEachIndex,
      attempt: testResult.retry + 1,
      source: this.getSource(test),
    });
    this.reporter.onTestBegin(testExecutionId, getMetadataFilePath(testResult.workerIndex));
  }

  getStepsFromFixture(test: TestExecutionIdData) {
    const hookMap: Record<
      "afterAll" | "afterEach" | "beforeAll" | "beforeEach",
      UserActionEvent[]
    > = {
      afterAll: [],
      afterEach: [],
      beforeAll: [],
      beforeEach: [],
    };
    const steps: UserActionEvent[] = [];

    const { steps: fixtureSteps, stacks, filenames } = this.getFixtureData(test);
    fixtureSteps?.forEach(fixtureStep => {
      const step: UserActionEvent = {
        data: {
          id: fixtureStep.id,
          parentId: null,
          command: {
            name: fixtureStep.apiName,
            arguments: this.parseArguments(fixtureStep.apiName, fixtureStep.params),
          },
          scope: test.source.scope,
          error: fixtureStep.error || null,
          category: mapFixtureStepCategory(fixtureStep),
        },
      };

      const stack = fixtureStep.frames.map(frame => ({
        line: frame.line,
        column: frame.column,
        functionName: frame.function,
        file: path.relative(process.cwd(), frame.file),
      }));

      if (stack) {
        stacks[fixtureStep.id] = stack;

        for (const frame of stack) {
          filenames.add(frame.file);
        }
      }

      if (fixtureStep.hook) {
        hookMap[fixtureStep.hook].push(step);
      } else {
        steps.push(step);
      }
    });

    return {
      beforeEach: hookMap.beforeEach,
      beforeAll: hookMap.beforeAll,
      afterAll: hookMap.afterAll,
      afterEach: hookMap.afterEach,
      main: steps,
    };
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    const testExecutionIdData = {
      filePath: test.location.file,
      projectName: test.parent.project()?.name,
      repeatEachIndex: test.repeatEachIndex,
      attempt: result.retry + 1,
      source: this.getSource(test),
    };

    const events = this.getStepsFromFixture(testExecutionIdData);

    const relativePath = test.titlePath()[2];
    const { stacks, filenames } = this.getFixtureData(testExecutionIdData);
    filenames.add(test.location.file);
    let playwrightMetadata: Record<string, any> | undefined;

    if (this.captureTestFile) {
      playwrightMetadata = {
        "x-replay-playwright": {
          sources: Object.fromEntries(
            [...filenames].map(filename => {
              try {
                return [filename, readFileSync(filename, "utf8")];
              } catch (e) {
                logger.error("PlaywrightReporter:FailedToReadPlaywrightTestSource", {
                  filename,
                  error: e,
                });
                return [filename, undefined];
              }
            })
          ),
          stacks,
        },
      };
    }

    const tests = [
      {
        id: 0,
        attempt: testExecutionIdData.attempt,
        source: testExecutionIdData.source,
        executionGroupId: String(testExecutionIdData.repeatEachIndex),
        executionId: this._getTestExecutionId(testExecutionIdData),
        maxAttempts: test.retries + 1,
        approximateDuration: test.results.reduce((acc, r) => acc + r.duration, 0),
        result: status === "interrupted" ? ("unknown" as const) : status,
        error: result.error
          ? {
              name: "Error",
              message: extractErrorMessage(result.error),
              line: result.error.location?.line ?? 0,
              column: result.error.location?.column ?? 0,
            }
          : null,
        events,
      },
    ];

    const recordings = this.reporter.getRecordingsForTest(tests);

    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];

      // our reporter has to come first in the list of configured reports for this to be useful to other reporters
      test.annotations.push({
        type: "Replay recording" + (i > 0 ? ` ${i + 1}` : ""),
        description: `https://app.replay.io/recording/${recording.id}`,
      });
    }

    this.reporter.onTestEnd({
      tests,
      specFile: relativePath,
      replayTitle: test.title,
      extraMetadata: playwrightMetadata,
    });
  }

  async onEnd() {
    try {
      await this.reporter.onEnd();

      const output: string[] = [];

      const projectsWithoutReplay = Object.keys(this._projects).filter(projectName => {
        const { executed, usingReplay } = this._projects[projectName];
        return executed && !usingReplay;
      });

      if (projectsWithoutReplay.length) {
        const projectText =
          projectsWithoutReplay[0] === ROOT_PROJECT_NAME
            ? "Your project"
            : `${projectsWithoutReplay.join(", ")} project${
                projectsWithoutReplay.length > 1 ? "s" : ""
              }`;

        output.push(
          `${projectText} ran without Replay Chromium. If this wasn't intentional, please recheck your configuration.`
        );
      }

      if (!existsSync(getRuntimePath())) {
        if (output.length) {
          output.push("");
        }
        output.push(`Install Replay Chromium by running ${highlight("npx replayio install")}`);
      }

      if (output.length) {
        output.push("");
        output.push(
          `Learn more at ${link(
            "https://docs.replay.io/reference/test-runners/playwright/overview"
          )}`
        );
        output.forEach(line => {
          console.warn(`[replay.io]: ${line}`);
        });
      }
    } finally {
      await logger.close().catch(() => {});
    }
  }

  parseArguments(apiName: string, params: any) {
    logger.info("PlaywrightReporter:ParseArguments", { apiName, params });
    if (!params || typeof params !== "object") {
      return [];
    }

    switch (apiName) {
      case "page.goto":
        return [params.url];
      case "page.evaluate":
        // TODO(ryanjduffy): This would be nice to improve but it can be nearly
        // anything so it's not obvious how to simplify it well to an array of
        // strings.
        return [];
      case "locator.getAttribute":
        return [params.selector, params.name];
      case "mouse.move":
        // params = {x: 0, y: 0}
        return [JSON.stringify(params)];
      case "locator.hover":
        return [params.selector, String(params.force)];
      case "expect.toBeVisible":
        return [params.selector, params.expression, String(params.isNot)];
      case "keyboard.type":
        return [params.text];
      case "keyboard.down":
      case "keyboard.up":
        return [params.key];
      case "locator.evaluate":
      case "locator.scrollIntoViewIfNeeded":
        return [params.selector, params.state];
      default:
        return params.selector ? [params.selector] : [];
    }
  }
}

export default ReplayPlaywrightReporter;
