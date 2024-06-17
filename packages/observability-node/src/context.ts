import { assert } from "./assert";
import { SemanticAttributeObject, SemanticBaggageObject, tracingManager } from "./otel";
import {
  Context as OtelContext,
  SpanContext,
  trace as traceApi,
  ROOT_CONTEXT,
  Span,
  Link,
  SpanStatusCode,
} from "@opentelemetry/api";

type OtelContextState = {
  context: OtelContext;
  name?: string;
  attributes: SemanticAttributeObject;
  baggage: SemanticBaggageObject;
};

type ContextOptions = {
  otelState?: OtelContextState;
};

type NamedSpanOptions = {
  name: string;
  attributes?: SemanticAttributeObject;
  baggage?: SemanticBaggageObject;
  links?: Array<Link>;
  parentContext?: SpanContext;
  kind?: number;
};

class Context {
  readonly otelState?: OtelContextState;

  constructor({ otelState }: ContextOptions) {
    this.otelState = otelState;
  }

  private clone(): this {
    const cx = this.doClone();
    assert(
      this.constructor === cx.constructor,
      this.constructor.name + " did not override doClone"
    );
    return cx;
  }

  doClone(): this {
    const cx = new Context(this);
    return cx as any;
  }

  // Create a new context with a nested otel context.
  // Do not use directly. Use `withNamedSpan` instead.
  withOtelContext(
    otelContext: OtelContext,
    opts?: {
      name?: string;
      attributes?: SemanticAttributeObject;
      baggage?: SemanticBaggageObject;
    }
  ): this {
    const otelState = this.otelState;
    const cx = this.clone();

    const newState: OtelContextState = {
      context: otelContext,
      name: opts?.name ?? otelState?.name,
      attributes: { ...opts?.attributes },
      baggage: { ...opts?.baggage, ...otelState?.baggage },
    };

    (cx as any).otelState = newState;
    return cx;
  }

  private getOtelSpan(): Span | undefined {
    return this.otelState ? traceApi.getSpan(this.otelState.context) : undefined;
  }

  getOtelSpanContext(): SpanContext | undefined {
    return this.getOtelSpan()?.spanContext();
  }

  addOtelEvent(name: string, attributes: SemanticAttributeObject) {}
  addOtelAttributes(attributes: SemanticAttributeObject) {
    if (!this.otelState) {
      return;
    }

    for (const [key, value] of Object.entries(attributes)) {
      this.otelState.attributes[key as keyof SemanticAttributeObject] = value;
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

async function withNamedSpan<C extends Context, T>(
  opts: string | NamedSpanOptions,
  cx: C,
  handler: (cx: C) => Promise<T>
): Promise<T> {
  if (typeof opts === "string") {
    opts = { name: opts };
  }

  if (!tracingManager) {
    return handler(cx);
  }

  const startTime = Date.now();

  assert(
    !opts.parentContext || !cx.otelState,
    "cannot overwrite otel state on existing otel context"
  );

  const parentContext = opts.parentContext
    ? traceApi.setSpanContext(ROOT_CONTEXT, opts.parentContext)
    : cx.otelState?.context || ROOT_CONTEXT;

  const parentSpanId = traceApi.getSpan(parentContext)?.spanContext().spanId;

  const { tracer } = tracingManager;

  const span = tracer.startSpan(
    opts.name,
    { startTime, links: opts?.links, kind: opts?.kind },
    parentContext
  );

  const childCx = cx.withOtelContext(traceApi.setSpan(parentContext, span), {
    name: opts.name,
    attributes: opts.attributes,
    baggage: opts.baggage,
  });

  const otelState = childCx.otelState;

  assert(otelState, "failed to create otel state");

  const spanContext = span.spanContext();

  try {
    console.log(
      "SENTINEL: spanStart",
      JSON.stringify({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        spanName: otelState?.name,
        ...otelState.baggage,
        ...otelState.attributes,
        parentSpanId,
      })
    );

    const result = await handler(childCx);
    span.setAttributes({ ...otelState.baggage, ...otelState.attributes });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    console.log(
      "SENTINEL: spanEnd",
      JSON.stringify({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        spanName: otelState?.name,
        ...otelState.baggage,
        ...otelState.attributes,
        parentSpanId,
      })
    );
    return result;
  } catch (e: any) {
    span.setAttributes({ ...otelState.baggage, ...otelState.attributes });

    span.setStatus({ code: SpanStatusCode.ERROR });
    span.addEvent("exception", { exception: e });
    span.end();

    console.log(
      "SENTINEL: spanEnd",
      JSON.stringify({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        spanName: otelState?.name,
        ...otelState.baggage,
        ...otelState.attributes,
        parentSpanId,
      })
    );

    throw e;
  }
}

export { type OtelContextState, Context, withNamedSpan };
