import { assert } from "./assert";
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
  otelState?: OtelContextState;
};

export class Context {
  readonly otelState?: OtelContextState;

  constructor({ otelState }: ContextOptions) {
    this.otelState = otelState;
  }

  withLogger(logger: Logger): this {
    const cx = this.clone();
    (cx as any).logger = logger;
    return cx;
  }

  private clone(): this {
    const cx = this.doClone();
    assert(
      this.constructor === cx.constructor,
      this.constructor.name + " did not override doClone"
    );
    return cx;
  }

  protected doClone(): this {
    const cx = new Context(this);
    return cx as any;
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
