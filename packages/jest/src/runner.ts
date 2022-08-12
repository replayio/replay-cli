import type { JestEnvironment } from "@jest/environment";
import type { Test, TestCaseResult, TestFileEvent, TestResult } from "@jest/test-result";
import type { Circus, Config } from "@jest/types";
import { listAllRecordings } from "@replayio/replay";
import { add, test as testMetadata } from "@replayio/replay/metadata";
import { writeFileSync } from "fs";
import type Runtime from "jest-runtime";
import path, { basename } from "path";
import { getMetadataFilePath } from ".";

const uuid = require("uuid");

const runner = require("jest-circus/runner");

const ReplayRunner = async (
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: Runtime,
  testPath: string,
  sendMessageToJest?: TestFileEvent
): Promise<TestResult> => {
  const runId = uuid.validate(
    process.env.RECORD_REPLAY_METADTA_TEST_RUN_ID || process.env.RECORD_REPLAY_TEST_RUN_ID || ""
  )
    ? process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  const runTitle = process.env.RECORD_REPLAY_METADTA_TEST_RUN_TITLE || "";
  let baseMetadata: Record<string, any> | null = null;

  function getTestId(test: Circus.TestEntry) {
    let name = [];
    let current: Circus.TestEntry | Circus.DescribeBlock | undefined = test;
    while (current && current.name !== "ROOT_DESCRIBE_BLOCK") {
      name.unshift(current.name);
      current = current.parent;
    }
    return `${runId}-${name.join("-")}`;
  }

  function getCurrentWorkerMetadataPath() {
    const workerIndex = +(process.env.JEST_WORKER_ID || 0);
    return getMetadataFilePath(workerIndex);
  }

  function setupMetadataFile() {
    console.log(">>>>", getCurrentWorkerMetadataPath());
    process.env.RECORD_REPLAY_METADATA_FILE = getCurrentWorkerMetadataPath();
  }

  function handleTestStart(test: Circus.TestEntry) {
    const metadataFilePath = getCurrentWorkerMetadataPath();

    writeFileSync(
      metadataFilePath,
      JSON.stringify(
        {
          "x-jest": {
            id: getTestId(test),
          },
        },
        undefined,
        2
      ),
      {}
    );
  }

  function handleResult(test: Circus.TestEntry, passed: boolean) {
    const relativePath = testPath; // path.relative(test.context.config.cwd, test.path);
    const title = test.name;

    const recs = listAllRecordings({
      filter: `function ($v) {
        $v.metadata.\`x-jest\`.id = "${getTestId(test)}" and $not($exists($v.metadata.test))
      }`,
    });

    if (recs.length > 0) {
      recs.forEach(r => {
        add(r.id, {
          title,
          ...baseMetadata,
          ...testMetadata.init({
            title,
            result: passed ? "passed" : "failed",
            path: ["", "jest", relativePath, title],
            run: {
              id: runId,
              title: runTitle,
            },
            file: relativePath,
          }),
        });
      });
    }
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

  environment = new Proxy(environment, {
    get(target, p) {
      if (p === "handleTestEvent") {
        return handleTestEventForReplay(target[p]);
      }

      return (target as any)[p];
    },
  });

  setupMetadataFile();
  return runner(globalConfig, config, environment, runtime, testPath, sendMessageToJest);
};

export default ReplayRunner;
