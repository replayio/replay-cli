import { Callback } from "mixpanel";
import type { mixpanelAPI as MixpanelAPIType, MixpanelImplementation } from "./mixpanelAPI";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("MixpanelAPI", () => {
  let mockMixpanelAPI: MixpanelImplementation;
  let mixpanelAPI: typeof MixpanelAPIType;

  const anyCallback = expect.any(Function);
  const anyProperties = expect.any(Object);

  beforeEach(() => {
    jest.useFakeTimers();

    mockMixpanelAPI = {
      init: jest.fn(),
      track: jest.fn((_, __, callback) => {
        callback?.(undefined);
      }),
    };

    jest.mock("../graphql/getAuthInfo", () => ({
      getAuthInfo: async () => ({
        id: "fake-session-id",
      }),
    }));

    // jest.resetModules does not work with import; only works with require()
    mixpanelAPI = require("./mixpanelAPI").mixpanelAPI;
    mixpanelAPI.mockForTests(mockMixpanelAPI);
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe("close", () => {
    it("should flush pending requests before closing", async () => {
      mixpanelAPI.initialize({
        accessToken: "fake-access-token",
        packageName: "fake-package",
        packageVersion: "0.0.0",
      });

      mixpanelAPI.trackEvent("pending-1");

      expect(mixpanelAPI.pendingEventsCount).toBe(1);

      await act(() => mixpanelAPI.close());

      expect(mixpanelAPI.pendingEventsCount).toBe(0);
    });

    it("should not hang when closing an uninitialized session", async () => {
      mixpanelAPI.trackEvent("pending-1");
      mixpanelAPI.trackEvent("pending-2");

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      await act(() => mixpanelAPI.close());
    });
  });

  describe("trackEvent", () => {
    describe("unauthenticated", () => {
      it("should not track any events until the user session has been identified", async () => {
        mixpanelAPI.trackEvent("pending-1");
        mixpanelAPI.trackEvent("pending-2");
        mixpanelAPI.trackEvent("pending-3");

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

        await act(() => {
          mixpanelAPI.initialize({
            accessToken: "fake-access-token",
            packageName: "fake-package",
            packageVersion: "0.0.0",
          });
        });

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(3);

        mixpanelAPI.trackEvent("unblocked-1");
        mixpanelAPI.trackEvent("unblocked-2");

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(5);
      });

      it("should track events after authentication fails", async () => {
        mixpanelAPI.trackEvent("pending-1", {
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

        await act(() => {
          mixpanelAPI.initialize({
            accessToken: undefined,
            packageName: "fake-package",
            packageVersion: "0.0.0",
          });
        });

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

        mixpanelAPI.trackEvent("unblocked-1");

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
      });

      it("should still include non-user-specific default properties", async () => {
        mixpanelAPI.trackEvent("fake-package.no-args");
        mixpanelAPI.trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

        await act(() => {
          mixpanelAPI.initialize({
            accessToken: undefined,
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
        mixpanelAPI.initialize({
          accessToken: "fake-access-token",
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });
      });

      it("should enforce the package name prefix", async () => {
        mixpanelAPI.trackEvent("has.no.prefix");
        mixpanelAPI.trackEvent("fake-package.has-prefix");

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
        mixpanelAPI.initialize({
          accessToken: "fake-access-token",
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });

        mixpanelAPI.trackEvent("fake-package.no-args");
        mixpanelAPI.trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
        expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
          1,
          "fake-package.no-args",
          {
            distinct_id: "fake-session-id",
            packageName: "fake-package",
            packageVersion: "0.0.0",
          },
          anyCallback
        );
        expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
          2,
          "fake-package.some-args",
          {
            bar: "abc",
            distinct_id: "fake-session-id",
            foo: 123,
            packageName: "fake-package",
            packageVersion: "0.0.0",
          },
          anyCallback
        );
      });

      it("should track pending promises until resolved or rejected", async () => {
        const callbacks: Callback[] = [];

        (mockMixpanelAPI.track as jest.Mock).mockImplementation((_, __, callback) => {
          callbacks.push(callback);
        });

        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

        mixpanelAPI.trackEvent("should-resolve");
        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

        mixpanelAPI.trackEvent("should-reject");
        expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);

        expect(callbacks.length).toBe(2);
        const successfulCallback = callbacks[0]!;
        const unsuccessfulCallback = callbacks[1]!;
        expect(mixpanelAPI.pendingEventsCount).toBe(2);

        unsuccessfulCallback(new Error("error"));
        expect(mixpanelAPI.pendingEventsCount).toBe(1);

        successfulCallback(undefined);
        expect(mixpanelAPI.pendingEventsCount).toBe(0);
      });

      describe("appendAdditionalProperties", () => {
        it("should support appending additional default properties", async () => {
          mixpanelAPI.initialize({
            accessToken: "fake-access-token",
            packageName: "fake-package",
            packageVersion: "0.0.0",
          });

          mixpanelAPI.trackEvent("fake-package.no-properties");
          mixpanelAPI.appendAdditionalProperties({ foo: 123 });
          mixpanelAPI.trackEvent("fake-package.some-properties");
          mixpanelAPI.appendAdditionalProperties({ bar: "abc" });
          mixpanelAPI.trackEvent("fake-package.some-more-properties");

          expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(3);
          expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
            1,
            "fake-package.no-properties",
            {
              distinct_id: "fake-session-id",
              packageName: "fake-package",
              packageVersion: "0.0.0",
            },
            anyCallback
          );
          expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
            2,
            "fake-package.some-properties",
            {
              distinct_id: "fake-session-id",
              foo: 123,
              packageName: "fake-package",
              packageVersion: "0.0.0",
            },
            anyCallback
          );
          expect(mockMixpanelAPI.track).toHaveBeenNthCalledWith(
            3,
            "fake-package.some-more-properties",
            {
              bar: "abc",
              distinct_id: "fake-session-id",
              foo: 123,
              packageName: "fake-package",
              packageVersion: "0.0.0",
            },
            anyCallback
          );
        });
      });
    });
  });

  describe("trackAsyncEvent", () => {
    let createDeferred: typeof import("../async/createDeferred").createDeferred;

    beforeEach(async () => {
      createDeferred = require("../async/createDeferred").createDeferred;

      await mixpanelAPI.initialize({
        accessToken: "fake-access-token",
        packageName: "fake-package",
        packageVersion: "0.0.0",
      });
    });

    it("should return the result of the promise after logging", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test");

      deferred.resolve("resolution");

      await expect(promise).resolves.toBe("resolution");
    });

    it("should return the result of the a void promise after logging", async () => {
      const deferred = createDeferred<void>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test");

      deferred.resolve();

      await expect(promise).resolves.toBe(undefined);
    });

    it("should re-throw a rejected promise error after logging", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test");

      const error = new Error("error");
      deferred.reject(error);

      await expect(promise).rejects.toBe(error);
    });

    it("should log the duration and status (successful) of a successful promise", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test");

      jest.advanceTimersByTime(2_500);

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      deferred.resolve("resolution");

      await expect(promise).resolves;

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        duration: 2_500,
        succeeded: true,
      });
    });

    it("should log the duration and status (unsuccessful) of a rejected promise", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test");

      jest.advanceTimersByTime(5_000);

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(0);

      deferred.reject(new Error("error"));

      try {
        await promise;
      } catch (error) {}

      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        duration: 5_000,
        succeeded: false,
      });
    });

    it("should support lazy properties that depend on the result of a resolved promise", async () => {
      const mockGetProperties = jest.fn(result => ({
        anotherProperty: "another",
        result,
      }));

      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test", mockGetProperties);

      expect(mockGetProperties).not.toHaveBeenCalled();

      deferred.resolve("resolution");

      await expect(promise).resolves.toBe("resolution");

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        anotherProperty: "another",
        result: "resolution",
      });
    });

    it("should support lazy properties that depend on the result of a rejected promise", async () => {
      const mockGetProperties = jest.fn((_, error) => ({
        anotherProperty: "another",
        error,
      }));

      const deferred = createDeferred<string>();
      const promise = mixpanelAPI.trackAsyncEvent(deferred.promise, "test", mockGetProperties);

      expect(mockGetProperties).not.toHaveBeenCalled();

      const error = new Error("error");

      deferred.reject(error);

      try {
        await promise;
      } catch (error) {}

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        anotherProperty: "another",
        error,
      });
    });
  });
});
