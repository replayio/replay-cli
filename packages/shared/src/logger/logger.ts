import dbg from "debug";
import winston, { LogEntry } from "winston";
import LokiTransport from "winston-loki";
import { AuthInfo } from "../graphql/fetchAuthInfoFromGraphQL";

const GRAFANA_USER = "909360";
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ=="; // write-only permissions.
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

type LogLevel = "error" | "warn" | "info" | "debug";

type Tags = Record<string, unknown>;

class Logger {
  private authInfo?: AuthInfo;
  private grafana: {
    logger: winston.Logger;
    close: () => Promise<void>;
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
      timeout: 5000,
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
      close: async () => {
        await lokiTransport.flush().catch(() => {});
        lokiTransport.close?.();
      },
    };
  }

  identify(authInfo: AuthInfo) {
    this.authInfo = authInfo;
  }

  private log(message: string, level: LogLevel, tags?: Tags) {
    this.localDebugger(message, JSON.stringify(tags));

    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    const entry: LogEntry = { level, message, tags };

    if (this.authInfo) {
      switch (this.authInfo.type) {
        case "user": {
          entry.userId = this.authInfo.id;
          break;
        }
        case "workspace": {
          entry.workspaceId = this.authInfo.id;
          break;
        }
      }
    }

    this.grafana.logger.log(entry);
  }

  async close() {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    return this.grafana.close();
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
  if (logger) {
    console.warn(`Logger already initialized.`);
    return logger;
  }
  logger = new Logger(name);
  return logger;
}

export { initLogger, logger };
