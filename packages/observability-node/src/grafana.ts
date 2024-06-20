import LokiTransport from "winston-loki";
import winston from "winston";

const USER_NAME = "909360";
// Token has write-only permissions.
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ==";
const GRAFANA_BASIC_AUTH = `${USER_NAME}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

const grafanaLogger = winston.createLogger({
  level: "debug",
  transports: [
    new LokiTransport({
      host: HOST,
      labels: { app: "replayio" },
      json: true,
      basicAuth: GRAFANA_BASIC_AUTH,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: err => console.error(err),
      gracefulShutdown: true,
    }),
  ],
});

type Tags = {
  [key: string]: any;
};

function grafanaDebug(message: string, tags?: Tags) {
  if (process.env.REPLAY_TELEMETRY_DISABLED) {
    return;
  }

  grafanaLogger.debug(message, tags);
}

function closeGrafanaLogger() {
  grafanaLogger.close();
}

export { grafanaDebug, closeGrafanaLogger };
