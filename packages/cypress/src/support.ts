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

function toCommandJSON(cmd: Cypress.CommandQueue): CommandLike {
  return {
    name: cmd.get("name"),
    id: cmd.get("id"),
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
  // Cypress doesn't send a command:end event when an error occurs so we capture
  // the last command ran here and then associate the error to it and emit our
  // step:end event in this case
  let lastCommand: Cypress.CommandQueue | undefined;

  Cypress.on("command:enqueued", cmd => handleCypressEvent("step:enqueue", cmd));
  Cypress.on("command:start", cmd => {
    lastCommand = cmd;
    return handleCypressEvent("step:start", toCommandJSON(cmd));
  });
  Cypress.on("command:end", cmd => handleCypressEvent("step:end", toCommandJSON(cmd)));
  Cypress.on("log:changed", log => {
    if (lastCommand && log?.err?.message) {
      handleCypressEvent("step:end", toCommandJSON(lastCommand), {
        message: log.err.message,
        line: log.err.codeFrame?.line,
        column: log.err.codeFrame?.column,
      });

      // clear the last command on error since we might see multiple log updates
      // but they're not relevant for our purposes once we've captured the error
      lastCommand = undefined;
    }
  });
  beforeEach(() => {
    lastCommand = undefined;

    handleCypressEvent("test:start");
    addAnnotation("test:start");
  });
  afterEach(() => handleCypressEvent("test:end"));
}
