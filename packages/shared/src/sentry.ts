// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

function initSentry() {
  Sentry.init({
    // DSNs are safe to keep public because they only allow submission of new events and related event data; they do not allow read access to any information.

    dsn: "https://5c145b72bb502832982243d6584f163d@o437061.ingest.us.sentry.io/4507534763819008",
    integrations: [nodeProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions

    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  });
}

function captureException(e: Error) {
  Sentry.captureException(e);
}

function closeSentry() {
  return Sentry.close();
}

export { captureException, closeSentry, initSentry };
