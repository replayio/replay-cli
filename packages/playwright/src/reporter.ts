import type {
  FullConfig,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";
import {
  getMetadataFilePath as getMetadataFilePathBase,
  removeAnsiCodes,
  ReplayReporter,
  ReplayReporterConfig,
  TestIdContext,
  TestMetadataV2,
} from "@replayio/test-utils";
import dbg from "debug";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { WebSocketServer } from "ws";

type UserActionEvent = TestMetadataV2.UserActionEvent;

import { getPlaywrightBrowserPath } from "@replayio/replay";
import { FixtureStepStart, ParsedErrorFrame, TestIdData } from "./fixture";
import { StackFrame } from "./playwrightTypes";
import { getServerPort, startServer } from "./server";

const debug = dbg("replay:playwright:reporter");
const pluginVersion = require("@replayio/playwright/package.json").version;

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

class ReplayPlaywrightReporter implements Reporter {
  reporter: ReplayReporter<ReplayPlaywrightRecordingMetadata>;
  captureTestFile: boolean;
  config: ReplayPlaywrightConfig;
  wss: WebSocketServer;
  fixtureData: Record<
    string,
    { steps: FixtureStep[]; stacks: Record<string, StackFrame[]>; filenames: Set<string> }
  > = {};

  constructor(config: ReplayPlaywrightConfig) {
    const browserPath = getPlaywrightBrowserPath("chromium");

    if (!browserPath) {
      throw new Error(`replay-chromium is not supported on this platform`);
    }

    if (!existsSync(browserPath)) {
      throw new Error(
        `replay-chromium is not available at ${browserPath}. Please run \`npx replay install\`.`
      );
    }

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
        plugin: pluginVersion,
      },
      "2.1.0",
      { ...this.config, metadataKey: "PLAYWRIGHT_REPLAY_METADATA" }
    );
    this.captureTestFile =
      "captureTestFile" in config
        ? !!config.captureTestFile
        : ["1", "true"].includes(
            process.env.PLAYWRIGHT_REPLAY_CAPTURE_TEST_FILE?.toLowerCase() || "true"
          );
    const port = getServerPort();
    debug(`Starting plugin WebSocket server on ${port}`);
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

  getFixtureData(test: TestIdData) {
    const key = this.getTestKey(test);
    this.fixtureData[key] ??= {
      steps: [],
      stacks: {},
      filenames: new Set(),
    };

    return this.fixtureData[key];
  }

  getTestKey(test: TestIdData) {
    return [test.id, test.attempt, ...test.source.scope, test.source.title].join("-");
  }

  getTestId(test: TestCase) {
    return test.titlePath().join("-");
  }

  getSource(test: TestCase) {
    return {
      title: test.title,
      scope: test.titlePath().slice(3, -1),
    };
  }

  getTestIdContext(test: TestCase, testResult: TestResult): TestIdContext {
    return {
      ...this.getSource(test),
      attempt: testResult.retry + 1,
    };
  }

  onBegin({ version }: FullConfig) {
    this.reporter.setTestRunnerVersion(version);
    this.reporter.onTestSuiteBegin();
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.reporter.onTestBegin(
      this.getTestIdContext(test, testResult),
      getMetadataFilePath(testResult.workerIndex)
    );
  }

  getStepsFromFixture(test: TestIdData) {
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

    const testMetadata = {
      id: 0,
      attempt: result.retry + 1,
      source: this.getSource(test),
    };

    const events = this.getStepsFromFixture(testMetadata);

    const relativePath = test.titlePath()[2];
    const { stacks, filenames } = this.getFixtureData(testMetadata);
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
                debug(`Failed to read playwright test source for: ${filename}`, e);
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
        ...testMetadata,
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
    await this.reporter.onEnd();
  }

  parseArguments(apiName: string, params: any) {
    debug("Arguments: %s %o", apiName, params);
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
