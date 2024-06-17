import { AttributeValue, ROOT_CONTEXT, trace as traceApi, Tracer } from "@opentelemetry/api";
import { HoneycombSDK } from "@honeycombio/opentelemetry-node";

let tracingManager: { tracer: Tracer; close: () => Promise<void> } | null = null;

// Returns the sdk so it can be shut down before the process exits.
function setupOpenTelemetryTracing(serviceName: string) {
  if (tracingManager) {
    return;
  }

  const sdk = new HoneycombSDK({
    apiKey: "7cbfc8bb584c46a5aa5a1588ab7b7052", // MBUDAYR - replay-playwright-plugin
    serviceName: "mbudayr",
    instrumentations: [],
    endpoint: "https://api.honeycomb.io/",
    dataset: "miriam-test",
  });

  tracingManager = { tracer: traceApi.getTracer(serviceName), close: sdk.shutdown };

  sdk.start();
}

enum SemanticAttributes {
  EXCEPTION_TYPE = "exception.type",
  EXCEPTION_MESSAGE = "exception.message",
}

export type SemanticAttributeObject = Partial<Record<SemanticAttributes, AttributeValue>>;

// Because baggage can be sent over a network boundary, its types are more limited than regular semantic attributes.
export type SemanticBaggageObject = Partial<Record<SemanticAttributes, string | number>>;

function emptyOtelContext() {
  return ROOT_CONTEXT;
}

export {
  SemanticAttributes,
  emptyOtelContext as emptyContext,
  setupOpenTelemetryTracing,
  HoneycombSDK,
  tracingManager,
};
