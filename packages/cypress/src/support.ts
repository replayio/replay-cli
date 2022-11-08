import type { TestError } from "@replayio/test-utils";

import { TASK_NAME } from "./constants";

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
  test: Cypress.currentTest.titlePath,
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

function addAnnotation(event: string) {
  const titlePath = JSON.stringify(Cypress.currentTest.titlePath);
  cy.window({ log: false }).then(win => {
    win.eval(`
      window.top.__RECORD_REPLAY_ANNOTATION_HOOK__ && window.top.__RECORD_REPLAY_ANNOTATION_HOOK__("replay-cypress", JSON.stringify({
        event: "${event}",
        titlePath: ${titlePath},
      }))
    `);
  });
}

export default function register() {
  // let lastCommand: Cypress.CommandQueue | undefined;

  Cypress.on("command:enqueued", cmd => handleCypressEvent("step:enqueue", cmd));
  Cypress.on("command:start", cmd => {
    return handleCypressEvent("step:start", toCommandJSON(cmd));
  });
  Cypress.on("command:end", cmd => handleCypressEvent("step:end", toCommandJSON(cmd)));
  Cypress.on("log:added", log => {
    // We only care about asserts
    if (log.name === "assert") {
      const cmd = {
        name: log.name,
        id: getReplayId(log.id),
        groupId: log.chainerId && getReplayId(log.chainerId),
        args: [log.consoleProps.Message],
      };
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

      handleCypressEvent("step:end", cmd, error);
    }
  });
  beforeEach(() => {
    gReplayIndex = 1;
    handleCypressEvent("test:start");
    addAnnotation("test:start");
  });
  afterEach(() => handleCypressEvent("test:end"));
}
