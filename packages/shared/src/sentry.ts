// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
import { AuthInfo } from "./graphql/fetchAuthInfoFromGraphQL";
import { getDeviceId } from "./getDeviceId";
import { randomUUID } from "crypto";
import { anonymizeStackTrace, Tags } from "./logger";

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
      console.warn(`Logger already initialized.`);
    }

    this.initSentry(app, version);
    this.initialized = true;
  }

  private initSentry(app: string, version: string | undefined) {
    Sentry.init({
      dsn: SENTRY_DSN, // write-only
      integrations: [nodeProfilingIntegration()],
    });

    Sentry.setTags({
      app,
      version,
    });
  }

  identify(authInfo: AuthInfo) {
    this.authInfo = authInfo;
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

  async close() {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    return Sentry.close();
  }

  captureException(error: Error, tags?: Tags) {
    if (process.env.REPLAY_TELEMETRY_DISABLED) {
      return;
    }

    const formattedTags = this.formatTags(tags);

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
function initSentry(app: string, version: string | undefined) {
  sentry.initialize(app, version);
}

export { initSentry };
