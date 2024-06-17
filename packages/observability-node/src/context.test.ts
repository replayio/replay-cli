import { Context, OtelContextState } from "./context";
import { SemanticAttributes, emptyContext } from "./otel";

describe("Context", () => {
  describe("addOtelAttributes", () => {
    it("does nothing if the context object lacks otel state", () => {
      const cx = new Context({});
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
        otelState,
      });

      expect(cx.otelState?.attributes).toEqual({});
      cx.addOtelAttributes({ [SemanticAttributes.EXCEPTION_MESSAGE]: "test exception message" });
      expect(cx.otelState?.attributes).toEqual({ "exception.message": "test exception message" });
    });
  });

  describe("addInheritedOtelBaggage", () => {
    it("does nothing if the context object lacks otel state", () => {
      const cx = new Context({});
      expect(cx.otelState).toBe(undefined);

      cx.addInheritedOtelBaggage({
        [SemanticAttributes.EXCEPTION_MESSAGE]: "test exception message",
      });

      expect(cx.otelState).toBe(undefined);
    });

    it("adds baggage to the otel state", () => {
      const otelState: OtelContextState = {
        context: emptyContext(),
        name: "test otel context",
        attributes: {},
        baggage: {},
      };

      const cx = new Context({
        otelState,
      });

      expect(cx.otelState?.baggage).toEqual({});
      expect(cx.otelState?.attributes).toEqual({});

      cx.addInheritedOtelBaggage({
        [SemanticAttributes.EXCEPTION_MESSAGE]: "test exception message",
      });
      expect(cx.otelState?.baggage).toEqual({ "exception.message": "test exception message" });
      expect(cx.otelState?.attributes).toEqual({ "exception.message": "test exception message" });
    });
  });
});
