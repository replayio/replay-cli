import type { TestError } from "@replayio/test-utils";

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
  command?: CommandLike;
  error?: TestError;
}

interface CommandLike {
  id: string;
  groupId?: string;
  name: string;
  args: any[];
}

const makeEvent = (event: StepEvent["event"], cmd?: CommandLike, error?: TestError): StepEvent => ({
  event,
  test: getCurrentTest().titlePath,
  file: Cypress.spec.relative,
  timestamp: new Date().toISOString(),
  command: cmd,
  ...(error
    ? {
        error,
      }
    : null),
});

const handleCypressEvent = (event: StepEvent["event"], cmd?: CommandLike, error?: TestError) => {
  if (cmd?.args[0] === TASK_NAME) return;

  const arg = makeEvent(event, cmd, error);

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

function addAnnotation(event: string, data?: Record<string, any>) {
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

  Cypress.on("command:enqueued", cmd => {
    const id = getReplayId(cmd.id);
    addAnnotation("step:enqueue", { commandVariable: "cmd", id });
    handleCypressEvent("step:enqueue", Object.assign({}, cmd, { id }));
  });
  Cypress.on("command:start", cmd => {
    const next = cmd.get("next");
    if (next?.get("type") === "assertion") {
      nextAssertion = next;
    }

    addAnnotation("step:start", { commandVariable: "cmd", id: cmd.get("id") });
    return handleCypressEvent("step:start", toCommandJSON(cmd));
  });
  Cypress.on("command:end", cmd => {
    addAnnotation("step:end", { commandVariable: "cmd", id: cmd.get("id") });
    handleCypressEvent("step:end", toCommandJSON(cmd));
  });
  Cypress.on("log:added", log => {
    // We only care about asserts
    if (log.name === "assert") {
      const cmd = {
        name: log.name,
        id: getReplayId(nextAssertion?.id ?? log.id),
        groupId: log.chainerId && getReplayId(log.chainerId),
        args: [log.consoleProps.Message],
      };
      addAnnotation("step:start", { commandVariable: "cmd", id: cmd.id });
      handleCypressEvent("step:start", cmd);
    }
  });
  Cypress.on("log:changed", log => {
    // We only care about asserts
    if (log.name === "assert" && ["passed", "failed"].includes(log.state)) {
      const cmd = {
        name: log.name,
        id: getReplayId(log.id),
        args: [log.consoleProps.Message],
      };

      const error = log.err
        ? {
            name: log.err.name,
            message: log.err.message,
            line: log.err.codeFrame?.line,
            column: log.err.codeFrame?.column,
          }
        : undefined;

      addAnnotation("step:end", { commandVariable: "cmd", id: cmd.id });
      handleCypressEvent("step:end", cmd, error);
    }
  });
  beforeEach(() => {
    handleCypressEvent("test:start");
    addAnnotation("test:start");
  });
  afterEach(() => {
    handleCypressEvent("test:end");
    addAnnotation("test:end");
  });
}
