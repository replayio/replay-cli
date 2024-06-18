import { Context, OtelContextState } from "./context";
import { Logger } from "./logger";
import { SemanticAttributes, emptyContext } from "./otel";

describe("Context", () => {
  describe("addOtelAttributes", () => {
    it("does nothing if the context object lacks otel state", () => {
      const cx = new Context({ logger: new Logger("test-logger") });
      expect(cx.otelState).toBe(undefined);
      cx.addOtelAttributes({ [SemanticAttributes.EXCEPTION_MESSAGE]: "test exception message" });
      expect(cx.otelState).toBe(undefined);
    });

    it("adds attributes to the otel state", () => {
      const otelState: OtelContextState = {
        context: emptyContext(),
        name: "test otel context",
        attributes: {},
        baggage: {},
      };

      const cx = new Context({
        logger: new Logger("test-logger"),
        otelState,
      });

      expect(cx.otelState?.attributes).toEqual({});
      cx.addOtelAttributes({ [SemanticAttributes.EXCEPTION_MESSAGE]: "test exception message" });
      expect(cx.otelState?.attributes).toEqual({ "exception.message": "test exception message" });
    });
  });
});
