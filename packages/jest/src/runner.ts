import type { JestEnvironment } from "@jest/environment";
import type { TestFileEvent, TestResult } from "@jest/test-result";
import type { Circus, Config } from "@jest/types";
import {
  ReplayReporter,
  removeAnsiCodes,
  getMetadataFilePath as getMetadataFilePathBase,
  initMetadataFile,
} from "@replayio/test-utils";
import type Runtime from "jest-runtime";
import path from "path";

const runner = require("jest-circus/runner");
const pluginVersion = require("../package.json").version;

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("JEST", workerIndex);
}

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
    } finally {
      version = version || "0.0.0";
    }
  }

  const relativePath = path.relative(config.cwd, testPath);
  const reporter = new ReplayReporter({ name: "jest", version, plugin: pluginVersion }, "2.0.0");
  reporter.onTestSuiteBegin(undefined, "JEST_REPLAY_METADATA");

  function getSource(test: Circus.TestEntry) {
    let name = [];
    let current: Circus.TestEntry | Circus.DescribeBlock | undefined = test.parent;
    while (current && current.name !== "ROOT_DESCRIBE_BLOCK") {
      name.unshift(current.name);
      current = current.parent;
    }
    return {
      title: test.name,
      scope: name,
    };
  }

  function getWorkerIndex() {
    return +(process.env.JEST_WORKER_ID || 0);
  }

  function setupMetadataFile(env: NodeJS.ProcessEnv) {
    process.env.RECORD_REPLAY_METADATA_FILE = env.RECORD_REPLAY_METADATA_FILE = initMetadataFile(
      getMetadataFilePath(getWorkerIndex())
    );
  }

  function handleTestStart(test: Circus.TestEntry) {
    reporter.onTestBegin(getSource(test), getMetadataFilePath(getWorkerIndex()));
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

    reporter.onTestEnd({
      tests: [
        {
          approximateDuration: test.duration || 0,
          source: getSource(test),
          result: passed ? "passed" : "failed",
          error: errorMessage
            ? {
                name: "Error",
                message: errorMessage,
              }
            : null,
          events: {
            afterAll: [],
            afterEach: [],
            beforeAll: [],
            beforeEach: [],
            main: [],
          },
        },
      ],
      specFile: relativePath,
    });
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
