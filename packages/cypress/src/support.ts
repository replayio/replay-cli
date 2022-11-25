import type { TestError, TestStep } from "@replayio/test-utils";

import { TASK_NAME } from "./constants";

declare global {
  interface Window {
    __RECORD_REPLAY_ANNOTATION_HOOK__?: (name: string, value: any) => void;
  }
}

export interface StepEvent {
  event: "step:enqueue" | "step:start" | "step:end" | "test:start" | "test:end";
  test: string[];
  file: string;
  timestamp: string;
  category?: TestStep["category"];
  hook?: TestStep["hook"];
  command?: CommandLike;
  error?: TestError;
}

interface CommandLike {
  id: string;
  groupId?: string;
  name: string;
  args: any[];
}

const makeEvent = (
  currentTest: typeof Cypress.currentTest,
  event: StepEvent["event"],
  category?: TestStep["category"],
  cmd?: CommandLike,
  error?: TestError
): StepEvent => ({
  event,
  test: getCurrentTest().titlePath,
  file: Cypress.spec.relative,
  timestamp: new Date().toISOString(),
  command: cmd,
  category,
  hook: getCurrentTestHook(),
  ...(error
    ? {
        error,
      }
    : null),
});

const handleCypressEvent = (
  currentTest: typeof Cypress.currentTest,
  event: StepEvent["event"],
  category?: TestStep["category"],
  cmd?: CommandLike,
  error?: TestError
) => {
  if (cmd?.args[0] === TASK_NAME) return;

  const arg = makeEvent(currentTest, event, category, cmd, error);

  return Promise.resolve()
    .then(() => {
      // Adapted from https://github.com/archfz/cypress-terminal-report
      // @ts-ignore
      Cypress.backend("task", {
        task: TASK_NAME,
        arg,
      })
        // For some reason cypress throws empty error although the task indeed works.
        .catch(error => {
          /* noop */
        });
    })
    .catch(console.error)
    .then(() => cmd);
};

const idMap: Record<string, string> = {};
let gReplayIndex = 1;

const getReplayId = (cypressId: string) => {
  return (idMap[cypressId] = idMap[cypressId] || String(gReplayIndex++));
};

const getCurrentTestHook = (): TestStep["hook"] => {
  try {
    const { type, hookName } = (Cypress as any).mocha.getRunner().currentRunnable;
    if (type === "hook") {
      switch (hookName) {
        case "before each":
          return "beforeEach";
        case "after each":
          return "afterEach";
      }
    }
  } catch {
    return;
  }
};

function toCommandJSON(cmd: Cypress.CommandQueue): CommandLike {
  return {
    name: cmd.get("name"),
    id: getReplayId(cmd.get("id")),
    groupId: getReplayId(cmd.get("chainerId")),
    args: cmd.get("args"),
  };
}

interface MochaTest {
  title: string;
  parent: MochaTest;
}

let lastTest: MochaTest | undefined;

function getCurrentTest(): { title: string; titlePath: string[] } {
  if (Cypress.currentTest) {
    return Cypress.currentTest;
  }

  // Cypress < 8 logic
  const mochaRunner = (Cypress as any).mocha?.getRunner();

  if (!mochaRunner) {
    throw new Error(`Cypress version ${Cypress.version || "(unknown)"} is not supported`);
  }

  let currentTest: MochaTest = (lastTest = mochaRunner.test || lastTest);
  const titlePath = [];
  const title = currentTest?.title;
  while (currentTest?.title) {
    titlePath.unshift(currentTest.title);
    currentTest = currentTest.parent;
  }

  return { title, titlePath };
}

function addAnnotation(
  currentTest: typeof Cypress.currentTest,
  event: string,
  data?: Record<string, any>
) {
  const payload = JSON.stringify({
    ...data,
    event,
    titlePath: getCurrentTest().titlePath,
  });

  window.top &&
    window.top.__RECORD_REPLAY_ANNOTATION_HOOK__ &&
    window.top.__RECORD_REPLAY_ANNOTATION_HOOK__("replay-cypress", JSON.stringify(payload));
}

export default function register() {
  let nextAssertion: Cypress.CommandQueue | undefined;
  let currentTest: typeof Cypress.currentTest | undefined;

  Cypress.on("command:enqueued", cmd => {
    const id = getReplayId(cmd.id);
    addAnnotation(currentTest!, "step:enqueue", { commandVariable: "cmd", id });
    handleCypressEvent(currentTest!, "step:enqueue", "other", Object.assign({}, cmd, { id }));
  });
  Cypress.on("command:start", cmd => {
    const next = cmd.get("next");
    if (next?.get("type") === "assertion") {
      nextAssertion = next;
    }

    addAnnotation(currentTest!, "step:start", {
      commandVariable: "cmd",
      id: getReplayId(cmd.get("id")),
    });
    return handleCypressEvent(currentTest!, "step:start", "command", toCommandJSON(cmd));
  });
  Cypress.on("command:end", cmd => {
    const log = cmd
      .get("logs")
      .find((l: any) => l.get("name") === cmd.get("name"))
      ?.toJSON();
    addAnnotation(currentTest!, "step:end", {
      commandVariable: "cmd",
      logVariable: log ? "log" : undefined,
      id: getReplayId(cmd.get("id")),
    });
    handleCypressEvent(currentTest!, "step:end", "command", toCommandJSON(cmd));
  });
  Cypress.on("log:added", log => {
    // We only care about asserts
    if (log.name !== "assert") {
      return;
    }

    const replayId = getReplayId(nextAssertion?.get("id") || log.id);

    const cmd = {
      name: log.name,
      id: replayId,
      groupId: log.chainerId && getReplayId(log.chainerId),
      args: [log.consoleProps.Message],
      category: "assertion",
    };
    addAnnotation(currentTest!, "step:start", {
      commandVariable: nextAssertion ? "nextAssertion" : undefined,
      logVariable: "log",
      id: cmd.id,
    });
    handleCypressEvent(currentTest!, "step:start", "assertion", cmd);

    const logChanged = (changedLog: any) => {
      if (changedLog.id !== log.id || !["passed", "failed"].includes(changedLog.state)) return;

      // We only care about asserts
      const changedCmd = {
        ...cmd,
        // Update args which can be updated when an assert resolves
        args: [changedLog.consoleProps.Message],
      };

      const error = changedLog.err
        ? {
            name: changedLog.err.name,
            message: changedLog.err.message,
            line: changedLog.err.codeFrame?.line,
            column: changedLog.err.codeFrame?.column,
          }
        : undefined;

      addAnnotation(currentTest!, "step:end", {
        commandVariable: nextAssertion ? "nextAssertion" : undefined,
        logVariable: "changedLog",
        id: changedCmd.id,
      });
      handleCypressEvent(currentTest!, "step:end", "assertion", changedCmd, error);

      Cypress.off("logchanged", logChanged);
    };

    Cypress.on("log:changed", logChanged);
  });
  beforeEach(() => {
    currentTest = getCurrentTest();
    handleCypressEvent(currentTest!, "test:start");
    addAnnotation(currentTest!, "test:start");
  });
  afterEach(() => {
    handleCypressEvent(currentTest!, "test:end");
    addAnnotation(currentTest!, "test:end");
  });
}
