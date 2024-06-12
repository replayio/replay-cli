import LokiTransport from "winston-loki";
import winston from "winston";

import debug from "debug";
import { fetchUserIdFromGraphQLOrThrow } from "./graphql/fetchUserIdFromGraphQLOrThrow";

const dbg = debug("replayio:grafana");

const USER_NAME = "909360";
// Token has write-only permissions.
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ==";
const GRAFANA_BASIC_AUTH = `${USER_NAME}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

let grafanaLogger: winston.Logger | undefined;
let userOrWorkspaceId: string | undefined;
let transport: LokiTransport | undefined;

async function initGrafana(accessToken?: string, packageName?: string) {
  if (grafanaLogger) {
    return;
  }

  console.log("SENTINEL: initGrafana accessToken", accessToken);
  dbg("Initializing grafana logger");

  if (accessToken) {
    userOrWorkspaceId = Buffer.from(
      await fetchUserIdFromGraphQLOrThrow(accessToken),
      "base64"
    ).toString();
  }

  console.log("SENTINEL: userId", userOrWorkspaceId);
  transport = new LokiTransport({
    host: HOST,
    labels: { app: "replayio" },
    json: true,
    basicAuth: GRAFANA_BASIC_AUTH,
    format: winston.format.json(),
    replaceTimestamp: true,
    onConnectionError: err => console.error(err),
    gracefulShutdown: true,
  });

  grafanaLogger = winston.createLogger({
    level: "debug",
    transports: [transport],
  });
}

type Tags = {
  [key: string]: any;
};

function grafanaDebug(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  grafanaLogger?.debug(message, { ...tags, userOrWorkspaceId });
}

function grafanaError(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  grafanaLogger?.error(message, { ...tags, userOrWorkspaceId });
}

// https://github.com/winstonjs/winston/issues/1504
async function closeGrafanaLogger(): Promise<void> {
  await transport?.flush();
}

export { grafanaDebug, grafanaError, closeGrafanaLogger, initGrafana };
