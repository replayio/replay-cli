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

  beforeEach(() => {
    mockMixpanelAPI = {
      init: jest.fn(),
      track: jest.fn(),
    };

    // jest.resetModules does not work with import; only works with require()
    configureSession = require("./session").configureSession;
    getPendingEvents = require("./pendingEvents").getPendingEvents;
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
        configureSession("fake-access-token", {
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(3);

      trackEvent("unblocked-1");
      trackEvent("unblocked-2");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(5);
    });

    it("should track events after authentication fails", async () => {
      trackEvent("pending-1", {
        packageName: "fake-package",
        packageVersion: "0.0.0",
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      await act(() => {
        configureSession(undefined, {
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      trackEvent("unblocked-1");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
    });

    it("should still include non-user-specific default properties", async () => {
      trackEvent("fake-package.no-args");
      trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

      await act(() => {
        configureSession(undefined, {
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });
      });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "fake-package.no-args",
        { packageName: "fake-package", packageVersion: "0.0.0" },
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "fake-package.some-args",
        { foo: 123, bar: "abc", packageName: "fake-package", packageVersion: "0.0.0" },
        anyCallback
      );
    });
  });

  describe("authenticated", () => {
    beforeEach(() => {
      configureSession("fake-user-id", {
        packageName: "fake-package",
        packageVersion: "0.0.0",
      });
    });

    it("should enforce the package name prefix", async () => {
      trackEvent("has.no.prefix");
      trackEvent("fake-package.has-prefix");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "fake-package.has.no.prefix",
        anyProperties,
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "fake-package.has-prefix",
        anyProperties,
        anyCallback
      );
    });

    it("should include additional user-specific default properties when authenticated", async () => {
      configureSession("fake-user-id", {
        packageName: "fake-package",
        packageVersion: "0.0.0",
      });

      trackEvent("fake-package.no-args");
      trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        1,
        "fake-package.no-args",
        {
          distinct_id: "fake-user-id",
          packageName: "fake-package",
          packageVersion: "0.0.0",
        },
        anyCallback
      );
      expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
        2,
        "fake-package.some-args",
        {
          distinct_id: "fake-user-id",
          foo: 123,
          bar: "abc",
          packageName: "fake-package",
          packageVersion: "0.0.0",
        },
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
