import * as Sentry from "@sentry/node";
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
import { AuthInfo } from "./graphql/fetchAuthInfoFromGraphQL";
import { getDeviceId } from "./getDeviceId";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import { formatTags, Tags } from "./formatTags";

const SENTRY_DSN =
  "https://5c145b72bb502832982243d6584f163d@o437061.ingest.us.sentry.io/4507534763819008"; // write-only permissions

class SentryAPI {
  private deviceId: string;
  private sessionId: string;
  private authInfo?: AuthInfo;
  private initialized: boolean = false;

  constructor() {
    this.deviceId = getDeviceId();
    this.sessionId = randomUUID();
  }

  initialize(app: string, version: string | undefined) {
    if (this.initialized) {
      console.warn(`Sentry already initialized.`);
    }

    Sentry.init({
      dsn: SENTRY_DSN,
      integrations: [nodeProfilingIntegration()],
    });

    Sentry.setTags({
      app,
      version,
    });

    this.initialized = true;
  }

  identify(authInfo: AuthInfo) {
    this.authInfo = authInfo;
  }

  async close() {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    await Sentry.close();
  }

  captureException(error: Error, tags?: Tags) {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    const formattedTags = formatTags(tags);

    const entry: Record<string, any> = {
      ...formattedTags,
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

    Sentry.captureException(error, entry);
  }
}

export const sentry = new SentryAPI();

// This should be called with the name once at the entry point.
// For example, with the Playwright plugin, it is called in the Reporter interface constructor.
export function initSentry(app: string, version: string | undefined) {
  sentry.initialize(app, version);
}

export async function withSentry<T>(fn: () => T | Promise<T>, tags?: Tags): Promise<T> {
  try {
    const result = await fn();
    return result;
  } catch (error: any) {
    sentry.captureException(error);
    throw error;
  }
}

export function withSentrySync<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error: any) {
    sentry.captureException(error);
    throw error;
  }
}
