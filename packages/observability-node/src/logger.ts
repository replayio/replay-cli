import winston from "winston";
import LokiTransport from "winston-loki";
import dbg from "debug";

const GRAFANA_USER = "909360";
// Token has write-only permissions.
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ==";
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

type LogLevel = "error" | "warn" | "info" | "debug";
const grafanaAllowLevels: LogLevel[] = ["error", "warn", "info"];

type Tags = {
  [key: string]: any;
};

type Auth = {
  userId: string | null;
  workspaceId: string | null;
};

class Logger {
  private authInfo?: Auth;
  private grafana: {
    logger: winston.Logger;
    flush: () => Promise<null>;
  };

  private name: string;
  private debugger: debug.Debugger;

  constructor(name: string, authInfo?: Auth) {
    this.name = `replayio:${name}`;
    this.grafana = this.initGrafana();
    this.debugger = dbg(name);
    this.authInfo = authInfo;
  }

  private initGrafana() {
    const lokiTransport = new LokiTransport({
      host: HOST,
      labels: { app: this.name },
      json: true,
      basicAuth: GRAFANA_BASIC_AUTH,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: err => console.error(err),
      gracefulShutdown: true,
    });

    return {
      logger: winston.createLogger({
        level: "debug",
        transports: [lokiTransport],
      }),
      flush: async () => lokiTransport?.flush(),
    };
  }

  identify(authInfo: Auth) {
    this.authInfo = authInfo;
  }

  private log(message: string, level: LogLevel, tags?: Tags) {
    this.debugger(message, JSON.stringify(tags));

    if (process.env.REPLAY_TELEMETRY_DISABLED || !grafanaAllowLevels.includes(level)) {
      return;
    }

    const { logger } = this.grafana;
    logger.log({ level, message, ...tags, ...this.authInfo });
  }

  async flush() {
    return this.grafana.flush();
  }

  debug(message: string, tags?: Tags) {
    this.log(message, "debug", tags);
  }

  error(message: string, tags?: Tags) {
    this.log(message, "error", tags);
  }

  info(message: string, tags?: Tags) {
    this.log(message, "info", tags);
  }

  warn(message: string, tags?: Tags) {
    this.log(message, "warn", tags);
  }
}

export { Logger };
