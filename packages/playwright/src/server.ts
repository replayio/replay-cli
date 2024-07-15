import { logInfo } from "@replay-cli/shared/logger";
import { ReporterError } from "@replayio/test-utils";
import dbg from "debug";
import { WebSocketServer } from "ws";
import { FixtureEvent, FixtureStepEnd, FixtureStepStart, TestExecutionIdData } from "./fixture";

const debug = dbg("replay:playwright:server");
const debugMessages = debug.extend("messages");

export function startServer({
  port = 0,
  onStepStart,
  onStepEnd,
  onError,
}: {
  port?: number;
  onStepStart?: (test: TestExecutionIdData, stepStart: FixtureStepStart) => void;
  onStepEnd?: (test: TestExecutionIdData, stepEnd: FixtureStepEnd) => void;
  onError?: (test: TestExecutionIdData, error: ReporterError) => void;
}) {
  logInfo("PlaywrightServer:Starting", {
    port,
    onStepStart: !!onStepStart,
    onStepEnd: !!onStepEnd,
    onError: !!onError,
  });

  const wss = new WebSocketServer({ port });

  wss.on("connection", function connection(ws) {
    logInfo("PlaywrightServer:ConnectionEstablished");

    ws.on("error", console.error);

    ws.on("message", function message(data) {
      try {
        const payload = data.toString("utf-8");
        debugMessages("Message received %s", payload);
        const fixtureEvent = JSON.parse(payload) as FixtureEvent;

        switch (fixtureEvent.event) {
          case "step:start":
            onStepStart?.(fixtureEvent.test, fixtureEvent);
            break;
          case "step:end":
            onStepEnd?.(fixtureEvent.test, fixtureEvent);
            break;
          case "error":
            onError?.(
              fixtureEvent.test,
              new ReporterError(fixtureEvent.code, fixtureEvent.message, fixtureEvent.detail)
            );
            break;
        }
      } catch (e) {
        console.error("[replay.io] Plugin socket error:", e);
      }
    });
  });

  const address = wss.address();
  if (typeof address === "string") {
    throw new Error("Unexpected server listening on pipe or domain socket");
  }

  logInfo("PlaywrightServer:Started", { port: address.port });

  return wss;
}

export function getServerPort(env: NodeJS.ProcessEnv = process.env) {
  if ("REPLAY_PLAYWRIGHT_PLUGIN_SERVER_PORT" in env && env.REPLAY_PLAYWRIGHT_PLUGIN_SERVER_PORT) {
    const port = Number.parseInt(env.REPLAY_PLAYWRIGHT_PLUGIN_SERVER_PORT);

    if (!isNaN(port)) {
      return port;
    }
  }

  return 52025;
}
