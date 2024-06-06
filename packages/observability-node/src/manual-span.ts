import {
  AttributeValue,
  Context as OtelContext,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace as traceApi,
  Tracer,
} from "@opentelemetry/api";
import { tracer } from "./reporter";

export enum SemanticAttributes {
  RPC_SYSTEM = "rpc.system",
  EXCEPTION_TYPE = "exception.type",
  EXCEPTION_MESSAGE = "exception.message",
}

type SemanticAttributeObject = Partial<Record<SemanticAttributes, AttributeValue>>;

export enum OtelEventTypes {
  // An exception thrown in the span.
  EXCEPTION = "exception",

  // Indicate that our infrastructure requested that the span abort execution.
  // Note: This does not mean that the span aborted, code may not immediately
  // respond to an abort, but this is stored when the abort is requested.
  ABORT_SIGNAL = "abortsignal",
}

function getExceptionOpenTelemetryAttributes(
  err: Error
): Record<string, string | boolean | undefined> {
  return {
    [SemanticAttributes.EXCEPTION_TYPE]: err.name,
    [SemanticAttributes.EXCEPTION_MESSAGE]: err.message,
  };
}

type WithNamedSpanOptions = {
  name: string;
  kind?: SpanKind;
  attributes?: SemanticAttributeObject;
};

export function emptyContext() {
  return ROOT_CONTEXT;
}

export async function withNamedSpan<C extends OtelContext, T>(
  handler: (childContext: OtelContext) => Promise<T>,
  parentContext: C,
  options: WithNamedSpanOptions
) {
  const span = new ManualSpan(options, tracer);

  try {
    const result = await handler(span.childContext());
    span.end();
    return result;
  } catch (e) {
    console.log(">>>SENTINEL error", JSON.stringify(e));
    span.end();
    throw e;
  }
}

/*
 * Wrapper around an OTEL span, with a limited API to conceal some of the grossness of things like
 * dealing directly with the OTEL API. Also has the ability to annotate spans with SIGTERM events,
 * and make sure that in the case of a SIGTERM we will finish this span.
 * */
export class ManualSpan {
  protected span: Span;

  private endTime: number | undefined;
  private readonly startTime: number;
  private readonly name: string;

  readonly otelContext: OtelContext;

  constructor(
    {
      attributes,
      kind,
      name,
      parentContext,
      startTime,
    }: {
      attributes?: SemanticAttributeObject;
      endOnSigterm?: boolean;
      kind?: SpanKind;
      name: string;
      parentContext?: OtelContext;
      startTime?: number;
    },
    tracer: Tracer
  ) {
    this.startTime = startTime ?? Date.now();
    this.name = name;

    this.span = tracer.startSpan(
      this.name,
      { startTime: this.startTime, kind, attributes },
      parentContext ?? ROOT_CONTEXT
    );
    this.otelContext = traceApi.setSpan(parentContext ?? ROOT_CONTEXT, this.span);
  }

  /*
   * setAttribute and setAttributes are just straight pass-throughs for adding fields to spans.
   */
  public setAttribute(attr: SemanticAttributes, value: string | number) {
    this.span.setAttribute(attr, value);
  }

  public setAttributes(attributes: SemanticAttributeObject) {
    this.span.setAttributes(attributes);
  }

  /*
   * end can take two optional parameters:
   * - endTime: defaults to `Date.now()`
   * - errorMessage: when set this will cause the span to show as errored in honeycomb, and this
   *  message will be added to the `error` field.
   */
  public end({ endTime, errorMessage }: { endTime?: number; errorMessage?: string } = {}) {
    console.log("SENTINEL: end ran");
    if (this.over()) {
      return;
    }
    this.endTime = endTime ?? Date.now();
    this.span.end(this.endTime);
    if (errorMessage) {
      this.setError(errorMessage);
    }
    console.log("SENTINEL: end exiting");
  }

  /*
   * Returns a spanContext, useful for extracting `spanId` and `traceId`, which can be sent to
   * other services for cross-service tracing.
   */
  public context() {
    return this.span.spanContext();
  }

  public childContext() {
    return this.otelContext;
  }

  /*
   * exception will add a specific exception *event* to the span. This is different from ending the
   * span with an errorMessage, since it will not automatically mark the span as failed.
   */
  public exception(err: Error) {
    this.span.addEvent(OtelEventTypes.EXCEPTION, getExceptionOpenTelemetryAttributes(err));
  }

  private setError(message: string) {
    this.span.setAttribute("error", message);
    this.span.setStatus({
      code: SpanStatusCode.ERROR,
      message,
    });
  }

  private over() {
    return typeof this.endTime === "number";
  }
}
