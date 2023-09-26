import dbg from "debug";
import WebSocket, { WebSocketServer } from "ws";
import { FixtureEvent, FixtureStepEnd, FixtureStepStart, TestIdData } from "./fixture";
import { ReporterError } from "@replayio/test-utils";

const debug = dbg("replay:playwright:server");
const debugMessages = debug.extend("messages");

export function startServer({
  port = 0,
  onStepStart,
  onStepEnd,
  onError,
}: {
  port?: number;
  onStepStart?: (test: TestIdData, stepStart: FixtureStepStart) => void;
  onStepEnd?: (test: TestIdData, stepEnd: FixtureStepEnd) => void;
  onError?: (test: TestIdData, error: ReporterError) => void;
}) {
  debug("Starting server on %d with handlers %o", port, {
    onStepStart: !!onStepStart,
    onStepEnd: !!onStepEnd,
    onError: !!onError,
  });

  const wss = new WebSocketServer({ port });

  wss.on("connection", function connection(ws) {
    debug("Connection established");

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

  debug("Server started on %d", address.port);

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