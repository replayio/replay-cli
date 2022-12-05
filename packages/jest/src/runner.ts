import type { JestEnvironment } from "@jest/environment";
import type { TestFileEvent, TestResult } from "@jest/test-result";
import type { Circus, Config } from "@jest/types";
import { ReplayReporter, removeAnsiCodes } from "@replayio/test-utils";
import type Runtime from "jest-runtime";
import path from "path";

import { getMetadataFilePath } from ".";

const runner = require("jest-circus/runner");
const pluginVersion = require("../package.json").version;

let version: string | undefined;

type MatcherResult = {
  actual: any;
  expected: any;
  message: string;
  name: string;
  pass: boolean;
};

const ReplayRunner = async (
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: Runtime,
  testPath: string,
  sendMessageToJest?: TestFileEvent
): Promise<TestResult> => {
  if (!version) {
    try {
      version = require(require.resolve("jest/package.json", {
        paths: [globalConfig.rootDir],
      }))?.version;
    } catch {}
  }

  const relativePath = path.relative(config.cwd, testPath);
  const reporter = new ReplayReporter({ name: "jest", version, plugin: pluginVersion });
  reporter.onTestSuiteBegin(undefined, "JEST_REPLAY_METADATA");

  function getTestId(test: Circus.TestEntry) {
    let name = [];
    let current: Circus.TestEntry | Circus.DescribeBlock | undefined = test;
    while (current && current.name !== "ROOT_DESCRIBE_BLOCK") {
      name.unshift(current.name);
      current = current.parent;
    }
    return `${relativePath}-${name.join("-")}`;
  }

  function getCurrentWorkerMetadataPath() {
    const workerIndex = +(process.env.JEST_WORKER_ID || 0);
    return getMetadataFilePath(workerIndex);
  }

  function setupMetadataFile(env: NodeJS.ProcessEnv) {
    process.env.RECORD_REPLAY_METADATA_FILE = env.RECORD_REPLAY_METADATA_FILE =
      getCurrentWorkerMetadataPath();
  }

  function handleTestStart(test: Circus.TestEntry) {
    reporter.onTestBegin(getTestId(test), getCurrentWorkerMetadataPath());
  }

  function getErrorMessage(errors: any[]) {
    const error: { matcherResult: MatcherResult } | null = errors
      .flat()
      .find(e => e && e.matcherResult);

    return removeAnsiCodes(error?.matcherResult.message);
  }

  function handleResult(test: Circus.TestEntry, passed: boolean) {
    const title = test.name;
    const errorMessage = getErrorMessage(test.errors);
    reporter.onTestEnd([
      {
        id: getTestId(test),
        title,
        result: passed ? "passed" : "failed",
        path: ["", "jest", relativePath, title],
        relativePath,
        error: errorMessage
          ? {
              message: errorMessage,
            }
          : undefined,
      },
    ]);
  }

  const handleTestEventForReplay = (original?: Circus.EventHandler) => {
    const replayHandler: Circus.EventHandler = (event, state) => {
      switch (event.name) {
        case "test_fn_start":
          handleTestStart(event.test);
          break;
        case "test_fn_success":
        case "test_fn_failure":
          const passed = event.name === "test_fn_success";
          handleResult(event.test, passed);
          break;
      }
      original?.(event as any, state);
    };

    return replayHandler;
  };

  // This code runs within a worker but we need to configure the metadata file
  // from the parent process. Injecting the env variable via the environment
  // seems to do the trick but an alternative would be to use a custom reporter
  // which also runs within the parent process.
  setupMetadataFile(environment.global.process.env);

  // JestEnvironment can either be node, jsdom, or a custom environment. Since
  // we can't know which the consumer is using, we proxy it to inject our custom
  // event handler in order to gain access to test_fn_* handlers.
  environment = new Proxy(environment, {
    get(target, p) {
      if (p === "handleTestEvent") {
        return handleTestEventForReplay(target[p]);
      }

      return (target as any)[p];
    },
  });

  return runner(globalConfig, config, environment, runtime, testPath, sendMessageToJest);
};

export default ReplayRunner;
