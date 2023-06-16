import type { TestMetadataV2 } from "@replayio/test-utils";

type TestError = TestMetadataV2.TestError;
type UserActionEvent = TestMetadataV2.UserActionEvent;

import { TASK_NAME } from "./constants";
import Debug from "debug";

const debug = Debug("replay:cypress:plugin:reporter:support");

declare global {
  interface Window {
    __RECORD_REPLAY_ANNOTATION_HOOK__?: (name: string, value: any) => void;
  }
}

type HookKind = "beforeAll" | "beforeEach" | "afterEach" | "afterAll";

export interface StepEvent {
  event: "step:enqueue" | "step:start" | "step:end" | "test:start" | "test:end";
  test: string[];
  file: string;
  timestamp: string;
  category?: UserActionEvent["data"]["category"];
  hook?: HookKind;
  command?: CommandLike;
  error?: TestError;
}

interface CommandLike {
  id: string;
  groupId?: string;
  name: string;
  args?: any[];
  commandId?: string;
}

// This lists cypress commands for which we don't need to track in metadata nor
// create annotations because they are "internal plumbing" commands that aren't
// user-facing
const COMMAND_IGNORE_LIST = ["within-restore", "end-logGroup"];

function shouldIgnoreCommand(cmd: Cypress.EnqueuedCommand | Cypress.CommandQueue) {
  if (isCommandQueue(cmd)) {
    cmd = cmd.toJSON() as any as Cypress.EnqueuedCommand;
  }

  return COMMAND_IGNORE_LIST.includes(cmd.name);
}

function simplifyCommand(cmd?: CommandLike) {
  if (!cmd) {
    return cmd;
  }

  let args = cmd.args || [];

  try {
    // simplify the command to omit complex objects that may exist in `args`
    args = JSON.parse(
      JSON.stringify(args, (key: string, value: unknown) => {
        if (key === "") {
          return value;
        }

        const t = typeof value;
        switch (t) {
          case "boolean":
          case "number":
          case "string":
            return value;
          case "object":
            const constructorName = (value as object)?.constructor?.name;
            if (constructorName === "jQuery") {
              return `[object ${(value as any).length === 1 ? "Node" : "NodeList"}]`;
            } else if (constructorName !== "Object") {
              return `[object ${constructorName}]`;
            } else {
              return value;
            }
          default:
            return undefined;
        }
      })
    );
  } catch (e) {
    console.error("Replay: Failed to serialize Cypress command");
    console.error(e);

    args = [];
  }

  return {
    ...cmd,
    args,
  };
}

const makeEvent = (
  currentPath: string[],
  event: StepEvent["event"],
  category?: UserActionEvent["data"]["category"],
  cmd?: CommandLike,
  error?: TestError
): StepEvent => ({
  event,
  test: currentPath,
  file: Cypress.spec.relative,
  timestamp: new Date().toISOString(),
  command: simplifyCommand(cmd),
  category,
  hook: getCurrentTestHook(),
  ...(error
    ? {
        error,
      }
    : null),
});

const handleCypressEvent = (
  currentPath: string[],
  event: StepEvent["event"],
  category?: UserActionEvent["data"]["category"],
  cmd?: CommandLike,
  error?: TestError
) => {
  if (cmd?.args?.[0] === TASK_NAME) return;

  const arg = makeEvent(currentPath, event, category, cmd, error);

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

interface RunnableHook {
  title: string;
  parent?: RunnableHook;
}

const getHookPath = (parent?: RunnableHook) => {
  const path: string[] = [];
  while (parent) {
    if (parent.title) {
      path.unshift(parent.title);
      parent = parent.parent;
    } else {
      break;
    }
  }

  return path;
};

const getCurrentTestHook = (): HookKind | undefined => {
  try {
    const { type, hookName } = (Cypress as any).mocha.getRunner().currentRunnable;

    if (type === "hook") {
      switch (hookName) {
        case "before all":
          return "beforeAll";
        case "before each":
          return "beforeEach";
        case "after each":
          return "afterEach";
        case "after all":
          return "afterAll";
      }
    }
  } catch {
    return;
  }
};

function getCypressId(cmd: Cypress.CommandQueue): string {
  // Cypress 8 doesn't include an `id` on the command so we fall back to
  // userInvocationStack as a means to uniquely identify a command
  return cmd.get("id") || cmd.get("userInvocationStack");
}

function toCommandJSON(cmd: Cypress.CommandQueue): CommandLike {
  return {
    name: cmd.get("name"),
    id: getReplayId(getCypressId(cmd)),
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

function getCurrentPath(currentTest: typeof Cypress.currentTest) {
  const hook = getCurrentTestHook();

  if (hook === "beforeAll" || hook === "afterAll") {
    const runnable = (Cypress as any).mocha.getRunner().currentRunnable;
    return getHookPath(runnable.parent);
  }

  return currentTest.titlePath;
}

function addAnnotation(path: string[], event: string, data?: Record<string, any>) {
  const payload = JSON.stringify({
    ...data,
    event,
    titlePath: path,
  });

  if (!window.top || !window.top.__RECORD_REPLAY_ANNOTATION_HOOK__) {
    debug("No annotation hook found");
    return;
  }

  window.top.__RECORD_REPLAY_ANNOTATION_HOOK__("replay-cypress", JSON.stringify(payload));
}

function isCommandQueue(cmd: any): cmd is Cypress.CommandQueue {
  return typeof cmd.toJSON === "function";
}

export default function register() {
  let lastCommand: Cypress.CommandQueue | undefined;
  let lastAssertionCommand: Cypress.CommandQueue | undefined;
  let currentTest: typeof Cypress.currentTest | undefined;

  Cypress.on("command:enqueued", cmd => {
    try {
      if (shouldIgnoreCommand(cmd)) {
        return;
      }

      // in cypress open, beforeEach isn't called so fetch the current test here
      // as a fallback
      currentTest = currentTest || getCurrentTest();

      // Sometimes, cmd is an instance of Cypress.CommandQueue but we can loosely
      // covert it using its toJSON method (which is typed wrong so we have to
      // cast it to any first)
      if (isCommandQueue(cmd)) {
        cmd = cmd.toJSON() as any as Cypress.EnqueuedCommand;
      }

      const id = getReplayId(
        cmd.id || cmd.userInvocationStack || [cmd.name, ...cmd.args].toString()
      );
      const currentPath = getCurrentPath(currentTest);
      addAnnotation(currentPath, "step:enqueue", { commandVariable: "cmd", id });
      handleCypressEvent(currentPath, "step:enqueue", "other", {
        id,
        groupId: getReplayId(cmd.chainerId),
        name: cmd.name,
        args: cmd.args,
      });
    } catch (e) {
      console.error("Replay: Failed to handle command:enqueue event");
      console.error(e);
    }
  });
  Cypress.on("command:start", cmd => {
    try {
      if (shouldIgnoreCommand(cmd)) {
        return;
      }

      lastCommand = cmd;
      lastAssertionCommand = undefined;

      const currentPath = getCurrentPath(currentTest!);
      addAnnotation(currentPath, "step:start", {
        commandVariable: "cmd",
        id: getReplayId(getCypressId(cmd)),
      });
      return handleCypressEvent(currentPath, "step:start", "command", toCommandJSON(cmd));
    } catch (e) {
      console.error("Replay: Failed to handle command:start event");
      console.error(e);
    }
  });
  Cypress.on("command:end", cmd => {
    try {
      if (shouldIgnoreCommand(cmd)) {
        return;
      }

      const log = cmd
        .get("logs")
        .find((l: any) => l.get("name") === cmd.get("name"))
        ?.toJSON();
      const currentPath = getCurrentPath(currentTest!);
      addAnnotation(currentPath, "step:end", {
        commandVariable: "cmd",
        logVariable: log ? "log" : undefined,
        id: getReplayId(getCypressId(cmd)),
      });
      handleCypressEvent(currentPath, "step:end", "command", toCommandJSON(cmd));
    } catch (e) {
      console.error("Replay: Failed to handle command:end event");
      console.error(e);
    }
  });
  Cypress.on("log:added", log => {
    const assertionCurrentTest = currentTest || getCurrentTest();
    const annotationCurrentPath = getCurrentPath(assertionCurrentTest);
    try {
      if (log.name === "new url") {
        addAnnotation(annotationCurrentPath, "event:navigation", {
          logVariable: "log",
          url: log.url,
          id: getReplayId(log.id),
        });

        return;
      } else if (log.name !== "assert") {
        return;
      }

      let maybeCurrentAssertion: Cypress.CommandQueue | undefined = lastAssertionCommand
        ? lastAssertionCommand.get("next")
        : lastCommand?.get("next");

      // if we failed to find an assertion command but this log is for an
      // assert, it's a chai assertion so we'll emit the command:start now
      if (!maybeCurrentAssertion && log.name === "assert") {
        // TODO [ryanjduffy]: This is making a log look like a command. This
        // works in this very narrow case but we should fix this acknowledge
        // that this is a chai assertion which is special and shouldn't
        // masquerade as a command
        maybeCurrentAssertion = {
          logs: () => [],
          add: () => {},
          get: (key?: any) => (!key ? log : log[key]),
          toJSON: () => log,
          create: () => ({} as any),
        };
      } else if (maybeCurrentAssertion?.get("type") !== "assertion") {
        // debug("Received an assertion log without a prior assertion or command: %o", {
        //   lastAssertionCommandId: lastAssertionCommand && getCypressId(lastAssertionCommand),
        //   lastCommandId: lastCommand && getCypressId(lastCommand),
        //   currentAssertion: maybeCurrentAssertion && maybeCurrentAssertion.toJSON(),
        // });
        return;
      }

      if (shouldIgnoreCommand(maybeCurrentAssertion)) {
        return;
      }

      const assertionId = getReplayId(getCypressId(maybeCurrentAssertion));

      // store the current assertion as the last assertion so we can identify the
      // enqueued command for chained assertions
      lastAssertionCommand = maybeCurrentAssertion;

      const cmd = {
        name: log.name,
        id: assertionId,
        groupId: log.chainerId && getReplayId(log.chainerId),
        args: [log.consoleProps.Message],
        category: "assertion",
        commandId: lastCommand ? getReplayId(getCypressId(lastCommand)) : undefined,
      };
      addAnnotation(annotationCurrentPath, "step:start", {
        commandVariable: "lastCommand",
        logVariable: "log",
        id: cmd.id,
      });
      handleCypressEvent(annotationCurrentPath, "step:start", "assertion", cmd);

      const logChanged = (changedLog: any) => {
        try {
          // This callback may be invoked multiple times for an assertion if Cypress
          // retries the evaluation. There doesn't appear to be an indication when
          // it's done retrying and it doesn't report `command:end` for failed
          // events so we're stuck capturing all of these and then ignoring the
          // intermediate events.

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

          if (error && lastCommand) {
            const failedCommandLog = lastCommand
              .get("logs")
              ?.find((l: any) => l.get("id") === changedLog.id);

            // if an assertion fails, emit step:end for the failed command
            addAnnotation(annotationCurrentPath, "step:end", {
              commandVariable: "lastCommand",
              logVariable: failedCommandLog ? "failedCommandLog" : undefined,
              id: getReplayId(getCypressId(lastCommand)),
            });
            handleCypressEvent(
              annotationCurrentPath,
              "step:end",
              "command",
              toCommandJSON(lastCommand)
            );
          }

          addAnnotation(annotationCurrentPath, "step:end", {
            commandVariable: maybeCurrentAssertion ? "maybeCurrentAssertion" : undefined,
            logVariable: "changedLog",
            id: changedCmd.id,
          });
          handleCypressEvent(annotationCurrentPath, "step:end", "assertion", changedCmd, error);
        } catch (e) {
          console.error("Replay: Failed to handle log:changed event");
          console.error(e);
        }
      };

      Cypress.on("log:changed", logChanged);
    } catch (e) {
      console.error("Replay: Failed to handle log:added event");
      console.error(e);
    }
  });
  beforeEach(() => {
    try {
      currentTest = getCurrentTest();
      if (currentTest) {
        const currentPath = getCurrentPath(currentTest);
        handleCypressEvent(currentPath, "test:start");
        addAnnotation(currentPath, "test:start");
      }
    } catch (e) {
      console.error("Replay: Failed to handle test:start event");
      console.error(e);
    }
  });
  afterEach(() => {
    try {
      if (currentTest) {
        const currentPath = getCurrentPath(currentTest);
        handleCypressEvent(currentPath, "test:end");
        addAnnotation(currentPath, "test:end");
      }
    } catch (e) {
      console.error("Replay: Failed to handle test:end event");
      console.error(e);
    }
  });
}
