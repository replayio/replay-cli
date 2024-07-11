import { randomUUID } from "crypto";
import dbg from "debug";
import StackUtils from "stack-utils";
import winston, { LogEntry } from "winston";
import LokiTransport from "winston-loki";
import { getDeviceId } from "./getDeviceId";
import { AuthenticatedTaskQueue } from "./session/AuthenticatedTaskQueue";
import { PackageInfo } from "./session/types";

const GRAFANA_USER = "909360";
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ=="; // write-only permissions.
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

const stackUtils = new StackUtils({ cwd: process.cwd(), internals: StackUtils.nodeInternals() });

function anonymizeStackTrace(stack: string): string {
  return stack
    .split("\n")
    .map(line => {
      const frame = stackUtils.parseLine(line);
      if (frame && frame.file) {
        const relativePath = frame.file.includes("node_modules")
          ? frame.file.substring(frame.file.indexOf("node_modules"))
          : frame.file;
        return line.replace(frame.file, relativePath);
      }
      return line;
    })
    .join("\n");
}

type LogLevel = "error" | "warn" | "info" | "debug";

type Tags = Record<string, unknown>;

class Logger {
  private deviceId: string;
  private grafana: {
    logger: winston.Logger;
    close: () => Promise<void>;
  } | null = null;
  private localDebugger: debug.Debugger;
  private sessionId: string;

  private queue = new AuthenticatedTaskQueue({
    onInitialize: ({ packageName, packageVersion }: PackageInfo) => {
      const lokiTransport = new LokiTransport({
        host: HOST,
        labels: { app: packageName, version: packageVersion },
        json: true,
        basicAuth: GRAFANA_BASIC_AUTH,
        format: winston.format.json(),
        replaceTimestamp: true,
        timeout: 5000,
        onConnectionError: err => this.localDebugger("Grafana connection error", err),
        gracefulShutdown: true,
      });

      this.grafana = {
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
    },
    onFinalize: async () => {
      if (process.env.REPLAY_TELEMETRY_DISABLED) {
        return;
      }

      await this.grafana?.close();
    },
  });

  constructor() {
    this.localDebugger = dbg("replay");
    this.deviceId = getDeviceId();
    this.sessionId = randomUUID();
  }

  private log(message: string, level: LogLevel, tags?: Tags) {
    this.queue.addToQueue(authInfo => {
      const formattedTags = this.formatTags(tags);

      this.localDebugger(message, formattedTags);

      if (process.env.REPLAY_TELEMETRY_DISABLED) {
        return;
      }

      const entry: LogEntry = {
        level,
        message,
        ...formattedTags,
        deviceId: this.deviceId,
        sessionId: this.sessionId,
      };

      if (authInfo) {
        switch (authInfo.type) {
          case "user": {
            entry.userId = authInfo.id;
            break;
          }
          case "workspace": {
            entry.workspaceId = authInfo.id;
            break;
          }
        }
      }

      if (this.grafana) {
        this.grafana.logger.log(entry);
      }
    });
  }

  private formatTags(tags?: Record<string, unknown>) {
    if (!tags) {
      return;
    }

    return Object.entries(tags).reduce((result, [key, value]) => {
      if (value instanceof Error) {
        result[key] = {
          // Intentionally keeping this for any extra properties attached in `Error`
          ...(value as any),
          errorName: value.name,
          errorMessage: value.message,
          errorStack: anonymizeStackTrace(value.stack ?? ""),
        };
      } else {
        result[key] = value;
      }
      return result;
    }, {} as Record<string, unknown>);
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
