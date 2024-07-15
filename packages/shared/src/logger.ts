import { randomUUID } from "crypto";
import dbg from "debug";
import StackUtils from "stack-utils";
import winston, { LogEntry } from "winston";
import LokiTransport from "winston-loki";
import { getDeviceId } from "./getDeviceId";
import { createTaskQueue } from "./session/createTaskQueue";

const GRAFANA_USER = "909360";
const GRAFANA_PUBLIC_TOKEN =
  "glc_eyJvIjoiOTEyOTQzIiwibiI6IndyaXRlLW90ZWwtcmVwbGF5LWNsaSIsImsiOiJ0UnFsOXV1a2QyQUI2NzIybDEzSkRuNDkiLCJtIjp7InIiOiJwcm9kLXVzLWVhc3QtMCJ9fQ=="; // write-only permissions.
const GRAFANA_BASIC_AUTH = `${GRAFANA_USER}:${GRAFANA_PUBLIC_TOKEN}`;
const HOST = "https://logs-prod-006.grafana.net";

type LogLevel = "error" | "warn" | "info" | "debug";
type Tags = Record<string, unknown>;

const stackUtils = new StackUtils({ cwd: process.cwd(), internals: StackUtils.nodeInternals() });

const deviceId = getDeviceId();
const localDebugger = dbg("replay");
const sessionId = randomUUID();

let grafana: {
  logger: winston.Logger;
  close: () => Promise<void>;
} | null = null;

const taskQueue = createTaskQueue({
  onDestroy: async () => {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    if (grafana) {
      await grafana.close();
    }
  },

  onInitialize: ({ packageInfo: { packageName, packageVersion } }) => {
    const lokiTransport = new LokiTransport({
      basicAuth: GRAFANA_BASIC_AUTH,
      format: winston.format.json(),
      gracefulShutdown: true,
      host: HOST,
      json: true,
      labels: { app: packageName, version: packageVersion },
      onConnectionError: err => localDebugger("Grafana connection error", err),
      replaceTimestamp: true,
      timeout: 5000,
    });

    grafana = {
      close: async () => {
        await lokiTransport.flush().catch(() => {});
        lokiTransport.close?.();
      },
      logger: winston.createLogger({
        // Levels greater than or equal to "info" ("info", "warn", "error") will be logged.
        // See https://github.com/winstonjs/winston?tab=readme-ov-file#logging.
        level: "info",
        transports: [lokiTransport],
      }),
    };
  },
});

export async function flushLog() {
  await taskQueue.flushAndClose();
}

export function logDebug(message: string, tags?: Record<string, any>) {
  log(message, "debug", tags);
}

export function logError(message: string, tags?: Tags) {
  log(message, "error", tags);
}

export function logInfo(message: string, tags?: Tags) {
  log(message, "info", tags);
}

export function logWarning(message: string, tags?: Tags) {
  log(message, "warn", tags);
}

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

function log(message: string, level: LogLevel, tags?: Tags) {
  taskQueue.push(authInfo => {
    const formattedTags = formatTags(tags);

    localDebugger(message, formattedTags);

    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      ...formattedTags,
      deviceId,
      sessionId,
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

    if (grafana) {
      grafana.logger.log(entry);
    }
  });
}

function formatTags(tags?: Record<string, unknown>) {
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
