import { Logger } from "./logger";
import { SemanticAttributeObject, SemanticBaggageObject } from "./otel";
import { context, Context as OtelContext } from "@opentelemetry/api";

export type OtelContextState = {
  context: OtelContext;
  name?: string;
  attributes: SemanticAttributeObject;
  baggage: SemanticBaggageObject;
};

type ContextOptions = {
  logger: Logger;
  otelState?: OtelContextState;
};

export class Context {
  readonly logger: Logger;
  readonly otelState?: OtelContextState;

  constructor({ logger, otelState }: ContextOptions) {
    this.logger = logger;
    this.otelState = otelState;
  }

  addOtelAttributes(attributes: SemanticAttributeObject) {
    if (!this.otelState) {
      return;
    }

    for (const [key, value] of Object.entries(attributes)) {
      this.otelState.attributes[key as keyof SemanticAttributeObject] = value; // MBUDAYR - note the required type coercion.
    }
  }

  addInheritedOtelBaggage(baggage: SemanticBaggageObject) {
    if (!this.otelState) {
      return;
    }

    this.addOtelAttributes(baggage);

    const newOtelState: OtelContextState = {
      ...this.otelState,
      baggage: { ...this.otelState.baggage, ...baggage },
    };

    (this.otelState as OtelContextState) = newOtelState;
  }
}
