import type { TestMetadataV2 } from "@replayio/test-utils";
import { TASK_NAME } from "./constants";

declare global {
  interface Window {
    __RECORD_REPLAY_ANNOTATION_HOOK__?: (name: string, value: any) => void;
  }
}

type TestError = TestMetadataV2.TestError;
type UserActionEvent = TestMetadataV2.UserActionEvent;
type HookKind = "beforeAll" | "beforeEach" | "afterEach" | "afterAll";

export interface StepEvent {
  event: "step:enqueue" | "step:start" | "step:end" | "test:start" | "test:end";
  test: string[];
  file: string;
  timestamp: string;
  testId: number | null;
  attempt: number;
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

interface CypressTestScope {
  test: string[];
  testId: number | null;
  attempt: number;
}

let gLastTest: MochaTest | undefined;
// order is dropped on test retries so we cache the last value so we can restore
// it for retries
let gLastOrder: number | undefined;

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

function shiftOptions(args: any[]) {
  if (args[0] && typeof args[0] === "object") {
    args.shift();
  }
}

function popOptions(args: any[], condition = true) {
  const lastArg = args[args.length - 1];
  if (condition && lastArg && typeof lastArg === "object") {
    args.pop();
  }
}

function simplifyCommand(cmd?: CommandLike) {
  if (!cmd) {
    return cmd;
  }

  let args = cmd.args || [];

  // Remove `options` from args so we don't capture them as command args in
  // metadata
  switch (cmd.name) {
    case "request":
    case "route":
    case "stub":
      break;
    case "then":
      shiftOptions(args);
      break;
    case "wrap":
      popOptions(args, args.length === 2);
      break;
    case "task":
      popOptions(args, args.length === 3);
      break;
    default:
      popOptions(args);
  }

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

function getCurrentTestScope(): CypressTestScope {
  const mochaTest = (cy as any).state("test");
  const mochaOrder = mochaTest?.order;
  let order = 0;
  if (mochaOrder != null && (gLastOrder == null || mochaOrder - 1 >= gLastOrder)) {
    gLastOrder = order = mochaOrder - 1;
  } else if (gLastOrder != null) {
    order = gLastOrder;
  }
  const attempt = (mochaTest?._currentRetry ?? 0) + 1;

  const hook = getCurrentTestHook();
  if (hook === "beforeAll" || hook === "afterAll") {
    const runnable = (Cypress as any).mocha.getRunner().currentRunnable;
    const test = getHookPath(runnable);
    return {
      test,
      attempt: 1,
      testId: null,
    };
  }

  if (Cypress.currentTest) {
    return {
      test: Cypress.currentTest.titlePath,
      attempt,
      testId: order,
    };
  }

  // Cypress < 8 logic
  const mochaRunner = (Cypress as any).mocha?.getRunner();

  if (!mochaRunner) {
    throw new Error(`Cypress version ${Cypress.version || "(unknown)"} is not supported`);
  }

  let currentTest: MochaTest = (gLastTest = mochaRunner.test || gLastTest);
  const titlePath = [];
  while (currentTest?.title) {
    titlePath.unshift(currentTest.title);
    currentTest = currentTest.parent;
  }

  return { test: titlePath, testId: order, attempt };
}

const makeEvent = (
  testScope: CypressTestScope,
  event: StepEvent["event"],
  category?: UserActionEvent["data"]["category"],
  cmd?: CommandLike,
  error?: TestError
): StepEvent => ({
  event,
  file: Cypress.spec.relative,
  testId: testScope.testId,
  test: testScope.test,
  attempt: testScope.attempt,
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

let eventBuffer: StepEvent[] = [];

const handleCypressEvent = (
  testScope: CypressTestScope,
  event: StepEvent["event"],
  category?: UserActionEvent["data"]["category"],
  cmd?: CommandLike,
  error?: TestError
) => {
  if (cmd?.args?.[0] === TASK_NAME) return;

  const arg = makeEvent(testScope, event, category, cmd, error);
  eventBuffer.push(arg);
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

function addAnnotation(testScope: CypressTestScope, event: string, data?: Record<string, any>) {
  const payload = JSON.stringify({
    ...data,
    ...testScope,
    event,
  });

  if (!window.top?.__RECORD_REPLAY_ANNOTATION_HOOK__) {
    return;
  }

  window.top.__RECORD_REPLAY_ANNOTATION_HOOK__("replay-cypress", JSON.stringify(payload));
}

function addAnnotationWithReferences(
  testScope: CypressTestScope,
  event: string,
  id: string,
  cmd?: any,
  log?: any
) {
  addAnnotation(testScope, event, {
    commandVariable: cmd ? "arguments[3]" : undefined,
    logVariable: log ? "arguments[4]" : undefined,
    id,
  });
}

function isCommandQueue(cmd: any): cmd is Cypress.CommandQueue {
  return typeof cmd.toJSON === "function";
}

export default function register() {
  let lastCommand: Cypress.CommandQueue | undefined;
  let lastAssertionCommand: Cypress.CommandQueue | undefined;
  let currentTestScope: CypressTestScope | undefined;

  Cypress.on("command:enqueued", cmd => {
    try {
      if (shouldIgnoreCommand(cmd)) {
        return;
      }

      // in cypress open, beforeEach isn't called so fetch the current test here
      // as a fallback
      currentTestScope = getCurrentTestScope();

      // Sometimes, cmd is an instance of Cypress.CommandQueue but we can loosely
      // covert it using its toJSON method (which is typed wrong so we have to
      // cast it to any first)
      if (isCommandQueue(cmd)) {
        cmd = cmd.toJSON() as any as Cypress.EnqueuedCommand;
      }

      const id = getReplayId(
        cmd.id || cmd.userInvocationStack || [cmd.name, ...cmd.args].toString()
      );
      addAnnotationWithReferences(currentTestScope, "step:enqueue", id, cmd);
      handleCypressEvent(currentTestScope, "step:enqueue", "other", {
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

      addAnnotationWithReferences(
        currentTestScope!,
        "step:start",
        getReplayId(getCypressId(cmd)),
        cmd
      );
      return handleCypressEvent(currentTestScope!, "step:start", "command", toCommandJSON(cmd));
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
        .find((l: any) => {
          if (cmd.get("name") === "log") {
            // log commands should only have one log but the name of the log is
            // the message instead of the command name
            return true;
          } else if (cmd.get("name") === "intercept" && l.get("name") === "route") {
            // the log name for intercept commands is "route" instead of "intercept"
            return true;
          }

          return l.get("name") === cmd.get("name");
        })
        ?.toJSON();
      addAnnotationWithReferences(
        currentTestScope!,
        "step:end",
        getReplayId(getCypressId(cmd)),
        cmd,
        log
      );
      handleCypressEvent(currentTestScope!, "step:end", "command", toCommandJSON(cmd));
    } catch (e) {
      console.error("Replay: Failed to handle command:end event");
      console.error(e);
    }
  });
  Cypress.on("log:added", log => {
    const assertionCurrentTest = currentTestScope || getCurrentTestScope();
    try {
      if (log.name === "new url") {
        addAnnotation(assertionCurrentTest, "event:navigation", {
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
      addAnnotationWithReferences(assertionCurrentTest, "step:start", cmd.id, lastCommand, log);
      handleCypressEvent(assertionCurrentTest, "step:start", "assertion", cmd);

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
            addAnnotationWithReferences(
              assertionCurrentTest,
              "step:end",
              getReplayId(getCypressId(lastCommand)),
              lastCommand,
              failedCommandLog
            );
            handleCypressEvent(
              assertionCurrentTest,
              "step:end",
              "command",
              toCommandJSON(lastCommand)
            );
          }

          addAnnotationWithReferences(
            assertionCurrentTest,
            "step:end",
            changedCmd.id,
            maybeCurrentAssertion,
            changedLog
          );
          handleCypressEvent(assertionCurrentTest, "step:end", "assertion", changedCmd, error);
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
      currentTestScope = getCurrentTestScope();
      if (currentTestScope) {
        handleCypressEvent(currentTestScope, "test:start");
        addAnnotation(currentTestScope, "test:start");
      }
    } catch (e) {
      console.error("Replay: Failed to handle test:start event");
      console.error(e);
    }
  });
  afterEach(() => {
    try {
      if (currentTestScope) {
        addAnnotation(currentTestScope, "test:end");
        handleCypressEvent(currentTestScope, "test:end");

        cy.task(TASK_NAME, eventBuffer, { log: false });

        eventBuffer = [];
      }
    } catch (e) {
      console.error("Replay: Failed to handle test:end event");
      console.error(e);
    }
  });
}
