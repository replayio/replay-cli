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
let lokiTransport: LokiTransport | undefined;

async function initGrafana(accessToken?: string, appLabel?: string) {
  if (grafanaLogger) {
    return;
  }

  // MBUDAYR - there are two parallel logging systems now - grafana and `dbg` - that I know of, and I'm not sure how to consolidate them (or if I should even attempt to).
  dbg("Initializing grafana logger");

  if (accessToken) {
    userOrWorkspaceId = Buffer.from(
      await fetchUserIdFromGraphQLOrThrow(accessToken),
      "base64"
    ).toString();
  }

  lokiTransport = new LokiTransport({
    host: HOST,
    labels: { app: !!appLabel ? `${appLabel}` : "replayio" },
    json: true,
    basicAuth: GRAFANA_BASIC_AUTH,
    format: winston.format.json(),
    replaceTimestamp: true,
    onConnectionError: err => console.error(err),
    gracefulShutdown: true,
  });

  grafanaLogger = winston.createLogger({
    level: "debug",
    transports: [lokiTransport],
  });

  log("GrafanaLoggerInitialized", "debug");
}

type Tags = {
  [key: string]: any;
};

type LogLevel = "error" | "warn" | "info" | "debug";

function log(message: string, level: LogLevel, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  if (!grafanaLogger) {
    // MBUDAYR - this seems aggressive, but without this, the logger could be broken and devs wouldn't notice.
    throw new Error("Grafana logger not initialized");
  }

  grafanaLogger.log({ level, message, ...tags, userOrWorkspaceId });
}

async function grafanaWarn(message: string, tags?: Tags) {
  log(message, "warn", tags);
}

async function grafanaDebug(message: string, tags?: Tags) {
  log(message, "debug", tags);
}

async function grafanaError(message: string, tags?: Tags) {
  log(message, "error", tags);
}

async function closeGrafanaLogger() {
  return lokiTransport?.flush();
}

export { closeGrafanaLogger, grafanaDebug, grafanaError, grafanaWarn, initGrafana };
