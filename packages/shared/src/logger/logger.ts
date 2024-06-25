import winston from "winston";
import LokiTransport from "winston-loki";
import dbg from "debug";
import { AuthIds } from "./graphql/fetchAuthIdsFromGraphQL";

const GRAFANA_USER = "909360";
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ=="; // write-only permissions.
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

type LogLevel = "error" | "warn" | "info" | "debug";

type Tags = Record<string, unknown>;

class Logger {
  private authIds?: AuthIds;
  private grafana: {
    logger: winston.Logger;
    flush: () => Promise<null>;
  };

  private name: string;
  private localDebugger: debug.Debugger;

  constructor(name: string) {
    this.name = `replayio:${name}`;
    this.localDebugger = dbg(name);
    this.grafana = this.initGrafana();
  }

  private initGrafana() {
    const lokiTransport = new LokiTransport({
      host: HOST,
      labels: { app: this.name },
      json: true,
      basicAuth: GRAFANA_BASIC_AUTH,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: err => this.localDebugger("Grafana connection error", err),
      gracefulShutdown: true,
    });

    return {
      logger: winston.createLogger({
        // Levels greater than or equal to "info" ("info", "warn", "error") will be logged.
        // See https://github.com/winstonjs/winston?tab=readme-ov-file#logging.
        level: "info",
        transports: [lokiTransport],
      }),
      flush: async () => lokiTransport?.flush(),
    };
  }

  identify(authIds: AuthIds) {
    this.authIds = authIds;
  }

  private log(message: string, level: LogLevel, tags?: Tags) {
    this.localDebugger(message, JSON.stringify(tags));

    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    this.grafana.logger.log({ level, message, ...tags, ...this.authIds });
  }

  async close() {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    return this.grafana.flush();
  }

  debug(message: string, tags?: Record<string, any>) {
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

let logger: Logger;

// This should be called with the name once at the entry point.
// For example, with the Playwright plugin, it is called in the Reporter interface constructor.
function initLogger(name: string) {
  if (!logger) {
    logger = new Logger(name);
  }
  return logger;
}

export { initLogger, logger };
