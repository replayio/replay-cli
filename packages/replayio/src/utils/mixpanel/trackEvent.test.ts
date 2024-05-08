import { MixpanelAPI } from "./types";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("trackEvent", () => {
  let mockMixpanelAPI: MixpanelAPI;
  let configureSession: typeof import("./session").configureSession;
  let getPendingEvents: typeof import("./pendingEvents").getPendingEvents;
  let trackEvent: typeof import("./trackEvent").trackEvent;

  const anyCallback = expect.any(Function);
  const anyProperties = expect.any(Object);
  const anyString = expect.any(String);

  beforeEach(() => {
    mockMixpanelAPI = {
      init: jest.fn(),
      track: jest.fn(),
    };

    // jest.resetModules does not work with import; only works with require()
    getPendingEvents = require("./pendingEvents").getPendingEvents;
    configureSession = require("./session").configureSession;
    trackEvent = require("./trackEvent").trackEvent;

    require("./getMixpanelAPI").setMixpanelAPIForTests(mockMixpanelAPI);
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe("unauthenticated", () => {
    it("should not track any events until the user session has been identified", async () => {
      trackEvent("pending-1");
      trackEvent("pending-2");
      trackEvent("pending-3");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      await act(() => {
        configureSession("fake-user-id");
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(3);

      trackEvent("unblocked-1");
      trackEvent("unblocked-2");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(5);
    });

    it("should track events after authentication fails", async () => {
      trackEvent("pending-1");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      await act(() => {
        configureSession(undefined);
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      trackEvent("unblocked-1");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
    });

    it("should still include non-user-specific default properties", async () => {
      trackEvent("replayio.no-args");
      trackEvent("replayio.some-args", { foo: 123, bar: "abc" });

      await act(() => {
        configureSession(undefined);
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "replayio.no-args",
        { packageVersion: anyString },
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "replayio.some-args",
        { foo: 123, bar: "abc", packageVersion: anyString },
        anyCallback
      );
    });
  });

  describe("authenticated", () => {
    beforeEach(() => {
      configureSession("fake-user-id");
    });

    it("should enforce the replayio. namespace prefix", async () => {
      trackEvent("has.no.prefix");
      trackEvent("replayio.has-prefix");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "replayio.has.no.prefix",
        anyProperties,
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "replayio.has-prefix",
        anyProperties,
        anyCallback
      );
    });

    it("should include additional user-specific default properties when authenticated", async () => {
      configureSession("fake-user-id");

      trackEvent("replayio.no-args");
      trackEvent("replayio.some-args", { foo: 123, bar: "abc" });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "replayio.no-args",
        { distinct_id: "fake-user-id", packageVersion: anyString },
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "replayio.some-args",
        { distinct_id: "fake-user-id", foo: 123, bar: "abc", packageVersion: anyString },
        anyCallback
      );
    });

    it("should track pending promises until resolved or rejected", async () => {
      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      trackEvent("should-resolve");
      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      trackEvent("should-reject");
      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);

      const successfulCallback = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][2];
      const unsuccessfulCallback = (mockMixpanelAPI.track as jest.Mock).mock.calls[1][2];

      expect(getPendingEvents().size).toBe(2);

      unsuccessfulCallback("error");
      expect(getPendingEvents().size).toBe(1);

      successfulCallback();
      expect(getPendingEvents().size).toBe(0);
    });
  });
});
