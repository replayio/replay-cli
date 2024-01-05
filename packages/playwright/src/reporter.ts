import dbg from "debug";
import { readFileSync } from "fs";
import path from "path";
import { WebSocketServer } from "ws";
import type {
  FullConfig,
  Reporter,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import {
  ReplayReporter,
  ReplayReporterConfig,
  removeAnsiCodes,
  TestMetadataV2,
  getMetadataFilePath as getMetadataFilePathBase,
  warn,
} from "@replayio/test-utils";

type UserActionEvent = TestMetadataV2.UserActionEvent;

import { getServerPort, startServer } from "./server";
import { FixtureStepStart, TestIdData, isFixtureEnabled } from "./fixture";

const debug = dbg("replay:playwright:reporter");
const pluginVersion = require("../package.json").version;

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

interface FixtureStep extends FixtureStepStart {
  error?: Error | undefined;
}

class ReplayPlaywrightReporter implements Reporter {
  reporter?: ReplayReporter;
  captureTestFile = ["1", "true"].includes(
    process.env.PLAYWRIGHT_REPLAY_CAPTURE_TEST_FILE?.toLowerCase() || "true"
  );
  wss: WebSocketServer;
  fixtureData: Record<
    string,
    { steps: FixtureStep[]; stacks: Record<string, any>; filenames: Set<string> }
  > = {};

  constructor() {
    const port = getServerPort();
    debug(`Starting plugin WebSocket server on ${port}`);
    this.wss = startServer({
      port,
      onStepStart: (test, step) => {
        const { steps } = this.getFixtureData(test);
        steps.push(step);
      },
      onStepEnd: (test, step) => {
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
    this.fixtureData[key] = this.fixtureData[key] || {
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

  getSource(test: TestCase) {
    return {
      title: test.title,
      scope: test.titlePath().slice(3, -1),
    };
  }

  onBegin(config: FullConfig) {
    const cfg = this.parseConfig(config);
    this.reporter = new ReplayReporter(
      {
        name: "playwright",
        version: config.version,
        plugin: pluginVersion,
      },
      "2.1.0"
    );
    this.reporter.onTestSuiteBegin(cfg, "PLAYWRIGHT_REPLAY_METADATA");

    if (cfg.captureTestFile === false) {
      this.captureTestFile = false;
    }
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    this.reporter?.onTestBegin(this.getSource(test), getMetadataFilePath(testResult.workerIndex));
  }

  getStepsFromResult(result: TestResult) {
    const hookMap = new Map<"beforeEach" | "afterEach", UserActionEvent[]>();
    const steps: UserActionEvent[] = [];

    for (let [i, s] of result.steps.entries()) {
      const hook = mapTestStepHook(s);
      const stepErrorMessage = s.error ? extractErrorMessage(s.error) : null;

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
                line: s.location?.line || 0,
                column: s.location?.column || 0,
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

    return {
      beforeAll: [],
      afterAll: [],
      beforeEach: hookMap.get("beforeEach") || [],
      afterEach: hookMap.get("afterEach") || [],
      main: steps,
    };
  }

  getStepsFromFixture(test: TestIdData) {
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

      const stack = fixtureStep.stackTrace.frames.map(frame => ({
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

      steps.push(step);
    });

    return {
      beforeAll: [],
      afterAll: [],
      beforeEach: [], // hookMap.get("beforeEach") || [],
      afterEach: [], // hookMap.get("afterEach") || [],
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

    const events = isFixtureEnabled()
      ? this.getStepsFromFixture(testMetadata)
      : this.getStepsFromResult(result);

    const relativePath = test.titlePath()[2];
    const { stacks, filenames } = this.getFixtureData(testMetadata);
    filenames.add(test.location.file);
    let playwrightMetadata: Record<string, any> | undefined;

    if (this.captureTestFile) {
      try {
        playwrightMetadata = {
          "x-replay-playwright": {
            sources: Object.fromEntries(
              [...filenames].map(filename => [filename, readFileSync(filename, "utf8")])
            ),
            stacks,
          },
        };
      } catch (e) {
        warn("Failed to read playwright test sources", e);
      }
    }

    this.reporter?.onTestEnd({
      tests: [
        {
          ...testMetadata,
          approximateDuration: test.results.reduce((acc, r) => acc + r.duration, 0),
          result: status === "interrupted" ? "unknown" : status,
          error: result.error
            ? {
                name: "Error",
                message: extractErrorMessage(result.error),
                line: (result.error as any).location?.line || 0,
                column: (result.error as any).location?.column || 0,
              }
            : null,
          events,
        },
      ],
      specFile: relativePath,
      replayTitle: test.title,
      extraMetadata: playwrightMetadata,
    });
  }

  async onEnd() {
    await this.reporter?.onEnd();
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
