import dbg from "debug";
import winston, { LogEntry } from "winston";
import LokiTransport from "winston-loki";
import { AuthInfo } from "./graphql/fetchAuthInfoFromGraphQL";
import { getDeviceId } from "./getDeviceId";
import { randomUUID } from "crypto";

const GRAFANA_USER = "909360";
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ=="; // write-only permissions.
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

type LogLevel = "error" | "warn" | "info" | "debug";

type Tags = Record<string, unknown>;

class Logger {
  private deviceId: string;
  private sessionId: string;
  private authInfo?: AuthInfo;
  private grafana: {
    logger: winston.Logger;
    close: () => Promise<void>;
  } | null = null;
  private initialized: boolean = false;
  private localDebugger: debug.Debugger;

  constructor() {
    this.localDebugger = dbg("replay");
    this.deviceId = getDeviceId();
    this.sessionId = randomUUID();
  }

  initialize(app: string, version: string | undefined) {
    if (this.initialized) {
      console.warn(`Logger already initialized.`);
    }

    this.initialized = true;
    this.localDebugger = dbg(app);
    this.grafana = this.initGrafana(app, version);
  }

  private initGrafana(app: string, version: string | undefined) {
    const lokiTransport = new LokiTransport({
      host: HOST,
      labels: { app, version },
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

    const entry: LogEntry = {
      level,
      message,
      tags,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
    };

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

    if (this.grafana) {
      this.grafana.logger.log(entry);
    }
  }

  async close() {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    if (this.grafana) {
      return this.grafana.close();
    }
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

export const logger = new Logger();

// This should be called with the name once at the entry point.
// For example, with the Playwright plugin, it is called in the Reporter interface constructor.
export function initLogger(app: string, version: string | undefined) {
  logger.initialize(app, version);
}
