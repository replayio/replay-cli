import LokiTransport from "winston-loki";
import winston from "winston";

const USER_NAME = "909360";
const GRAFANA_BASIC_AUTH = `${USER_NAME}:${process.env.GRAFANA_TOKEN}`;

const grafanaLogger = winston.createLogger({
  level: "debug",
  transports: [
    new LokiTransport({
      host: "https://logs-prod-006.grafana.net",
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
