import dbg from "debug";
import WebSocket, { WebSocketServer } from "ws";
import { FixtureEvent, FixtureStepStart } from "./fixture";

const debug = dbg("replay:playwright:server");

export function startServer({
  port = 0,
  onStepStart,
}: {
  port?: number;
  onStepStart?: (stepStart: FixtureStepStart) => void;
}) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", function connection(ws) {
    debug("Connection established");

    ws.on("error", console.error);

    ws.on("message", function message(data) {
      try {
        const payload = data.toString("utf-8");
        debug("Message received %s", payload);
        const { event, ...rest } = JSON.parse(payload) as FixtureEvent;

        if (event === "step:start") {
          onStepStart?.(rest);
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
