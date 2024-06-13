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

  grafanaDebug("GrafanaLoggerInitiated");
}

type Tags = {
  [key: string]: any;
};

// MBUDAYR - DRY this.

function grafanaDebug(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  if (!grafanaLogger) {
    throw new Error("Grafana logger not instantiated");
  }

  grafanaLogger.debug(message, { ...tags, userOrWorkspaceId });
}

function grafanaError(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  if (!grafanaLogger) {
    throw new Error("Grafana logger not instantiated");
  }

  grafanaLogger.error(message, { ...tags, userOrWorkspaceId });
}

function grafanaWarn(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  if (!grafanaLogger) {
    throw new Error("Grafana logger not instantiated");
  }

  grafanaLogger.warn(message, { ...tags, userOrWorkspaceId });
}

async function closeGrafanaLogger() {
  return lokiTransport?.flush();
}

export { grafanaDebug, grafanaError, closeGrafanaLogger, initGrafana, grafanaWarn };
