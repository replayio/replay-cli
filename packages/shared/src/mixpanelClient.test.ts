import { createDeferred, Deferred } from "./async/createDeferred";
import type { initializeSession as InitializeSessionType } from "./session/initializeSession";
import type { MixpanelImplementation } from "./mixpanelClient";
import type * as MixpanelClient from "./mixpanelClient";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("MixpanelClient", () => {
  let mockGetAuthInfo: jest.Mock;
  let mockMixpanelClient: MixpanelImplementation;
  let mixpanelClient: typeof MixpanelClient;

  const anyCallback = expect.any(Function);
  const anyProperties = expect.any(Object);

  async function initializePackageInfoOnly() {
    const { initializePackageInfo } = require("./session/initializePackageInfo");

    await initializePackageInfo({
      packageName: "fake-package-name",
      packageVersion: "0.0.0",
    });
  }

  async function initializeSession(includeAccessToken = true) {
    const { initializeSession } = require("./session/initializeSession");

    await initializeSession({
      accessToken: includeAccessToken ? "fake-access-token" : undefined,
      packageName: "fake-package",
      packageVersion: "0.0.0",
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();

    mockGetAuthInfo = jest.fn(async () => ({
      id: "fake-session-id",
    }));
    mockMixpanelClient = {
      init: jest.fn(),
      track: jest.fn((_, __, callback) => {
        callback?.(undefined);
      }),
    };

    // This test should not talk to our live GraphQL server
    jest.mock("./authentication/getAuthInfo", () => ({
      getAuthInfo: mockGetAuthInfo,
    }));

    // jest.resetModules does not work with import; only works with require()
    mixpanelClient = require("./mixpanelClient");
    mixpanelClient.mockForTests(mockMixpanelClient);
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe("close", () => {
    it("should flush pending requests before closing", async () => {
      await initializeSession();

      mixpanelClient.trackEvent("pending-1");

      expect(mixpanelClient.getQueueSizeForTests()).toBe(1);

      await act(() => mixpanelClient.closeMixpanel());

      expect(mixpanelClient.getQueueSizeForTests()).toBe(0);
    });

    it("should pending requests when closing an uninitialized session", async () => {
      await initializePackageInfoOnly();

      mixpanelClient.trackEvent("pending-1");
      mixpanelClient.trackEvent("pending-2");

      expect(mixpanelClient.getQueueSizeForTests()).toBe(2);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(0);

      await act(() => mixpanelClient.closeMixpanel());

      expect(mixpanelClient.getQueueSizeForTests()).toBe(0);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
    });
  });

  describe("createAsyncFunctionWithTracking", () => {
    beforeEach(async () => {
      await initializeSession();
    });

    it("should pass arguments along to trackAsyncEvent", async () => {
      const deferred = createDeferred<string>();

      const mockGetProperties = jest.fn((result: any, error: any) => ({
        error,
        result,
        anotherProperty: "another",
      }));

      const callbackWithTracking = mixpanelClient.createAsyncFunctionWithTracking(
        () => deferred.promise,
        "test-event",
        mockGetProperties
      );

      const promise = callbackWithTracking();

      expect(mockGetProperties).not.toHaveBeenCalled();

      deferred.resolve("result");

      await expect(promise).resolves.toEqual("result");

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        anotherProperty: "another",
        distinct_id: "fake-session-id",
        error: undefined,
        result: "result",
      });
    });

    it("should pass arguments along to the decorated method", async () => {
      const mockGetProperties = jest.fn((result: any, error: any) => ({
        error,
        result,
      }));

      const callbackWithTracking = mixpanelClient.createAsyncFunctionWithTracking(
        (foo, bar) => Promise.resolve({ foo, bar }),
        "test-event",
        mockGetProperties
      );

      const promise = callbackWithTracking("abc", 123);
      await expect(promise).resolves.toEqual({ foo: "abc", bar: 123 });

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        distinct_id: "fake-session-id",
        error: undefined,
        result: { foo: "abc", bar: 123 },
      });
    });

    it("should track each function call separately", async () => {
      const deferredArray: Deferred<string>[] = [];

      const mockGetProperties = jest.fn((result: any) => ({
        result,
      }));

      const callbackWithTracking = mixpanelClient.createAsyncFunctionWithTracking(
        () => {
          const deferred = createDeferred<string>();
          deferredArray.push(deferred);
          return deferred.promise;
        },
        "test-event",
        mockGetProperties
      );

      const promise1 = callbackWithTracking();
      const promise2 = callbackWithTracking();

      expect(mockGetProperties).not.toHaveBeenCalled();
      expect(deferredArray).toHaveLength(2);

      deferredArray[1].resolve("second");
      await expect(promise2).resolves.toEqual("second");

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);
      expect((mockMixpanelClient.track as jest.Mock).mock.calls[0][1]).toMatchObject({
        result: "second",
      });

      deferredArray[0].resolve("first");
      await expect(promise1).resolves.toEqual("first");

      expect(mockGetProperties).toHaveBeenCalledTimes(2);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
      expect((mockMixpanelClient.track as jest.Mock).mock.calls[1][1]).toMatchObject({
        result: "first",
      });
    });
  });

  describe("trackEvent", () => {
    describe("unauthenticated", () => {
      it("should not track any events until the user session has been identified", async () => {
        mixpanelClient.trackEvent("pending-1");
        mixpanelClient.trackEvent("pending-2");
        mixpanelClient.trackEvent("pending-3");

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(0);

        await initializeSession();

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(3);

        mixpanelClient.trackEvent("unblocked-1");
        mixpanelClient.trackEvent("unblocked-2");

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(5);
      });

      it("should track events after authentication fails", async () => {
        mixpanelClient.trackEvent("pending-1", {
          packageName: "fake-package",
          packageVersion: "0.0.0",
        });

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(0);

        await initializeSession();

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

        mixpanelClient.trackEvent("unblocked-1");

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
      });

      it("should still include non-user-specific default properties", async () => {
        mixpanelClient.trackEvent("fake-package.no-args");
        mixpanelClient.trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

        await initializeSession(false);

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
          1,
          "fake-package.no-args",
          { packageName: "fake-package", packageVersion: "0.0.0" },
          anyCallback
        );
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
          2,
          "fake-package.some-args",
          { foo: 123, bar: "abc", packageName: "fake-package", packageVersion: "0.0.0" },
          anyCallback
        );
      });
    });

    describe("authenticated", () => {
      beforeEach(async () => {
        await initializeSession();
      });

      it("should enforce the package name prefix", async () => {
        mixpanelClient.trackEvent("has.no.prefix");
        mixpanelClient.trackEvent("fake-package.has-prefix");

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
          1,
          "fake-package.has.no.prefix",
          anyProperties,
          anyCallback
        );
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
          2,
          "fake-package.has-prefix",
          anyProperties,
          anyCallback
        );
      });

      it("should include additional user-specific default properties when authenticated", async () => {
        mixpanelClient.trackEvent("fake-package.no-args");
        mixpanelClient.trackEvent("fake-package.some-args", { foo: 123, bar: "abc" });

        expect(mockMixpanelClient.track).toHaveBeenCalledTimes(2);
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
          1,
          "fake-package.no-args",
          {
            distinct_id: "fake-session-id",
            packageName: "fake-package",
            packageVersion: "0.0.0",
          },
          anyCallback
        );
        expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
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

      describe("appendAdditionalProperties", () => {
        it("should support appending additional default properties", async () => {
          await initializeSession();

          mixpanelClient.trackEvent("fake-package.no-properties");
          mixpanelClient.appendAdditionalProperties({ foo: 123 });
          mixpanelClient.trackEvent("fake-package.some-properties");
          mixpanelClient.appendAdditionalProperties({ bar: "abc" });
          mixpanelClient.trackEvent("fake-package.some-more-properties");

          expect(mockMixpanelClient.track).toHaveBeenCalledTimes(3);
          expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
            1,
            "fake-package.no-properties",
            {
              distinct_id: "fake-session-id",
              packageName: "fake-package",
              packageVersion: "0.0.0",
            },
            anyCallback
          );
          expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
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
          expect(mockMixpanelClient.track).toHaveBeenNthCalledWith(
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
    let createDeferred: typeof import("./async/createDeferred").createDeferred;

    beforeEach(async () => {
      createDeferred = require("./async/createDeferred").createDeferred;

      await initializeSession();
    });

    it("should return the result of the promise after logging", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test");

      deferred.resolve("resolution");

      await expect(promise).resolves.toBe("resolution");
    });

    it("should return the result of the a void promise after logging", async () => {
      const deferred = createDeferred<void>();
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test");

      deferred.resolve();

      await expect(promise).resolves.toBe(undefined);
    });

    it("should re-throw a rejected promise error after logging", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test");

      const error = new Error("error");
      deferred.reject(error);

      await expect(promise).rejects.toBe(error);
    });

    it("should log the duration and status (successful) of a successful promise", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test");

      jest.advanceTimersByTime(2_500);

      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(0);

      deferred.resolve("resolution");

      await expect(promise).resolves;

      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        duration: 2_500,
        succeeded: true,
      });
    });

    it("should log the duration and status (unsuccessful) of a rejected promise", async () => {
      const deferred = createDeferred<string>();
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test");

      jest.advanceTimersByTime(5_000);

      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(0);

      deferred.reject(new Error("error"));

      try {
        await promise;
      } catch (error) {}

      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
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
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test", mockGetProperties);

      expect(mockGetProperties).not.toHaveBeenCalled();

      deferred.resolve("resolution");

      await expect(promise).resolves.toBe("resolution");

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
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
      const promise = mixpanelClient.trackAsyncEvent(deferred.promise, "test", mockGetProperties);

      expect(mockGetProperties).not.toHaveBeenCalled();

      const error = new Error("error");

      deferred.reject(error);

      try {
        await promise;
      } catch (error) {}

      expect(mockGetProperties).toHaveBeenCalledTimes(1);
      expect(mockMixpanelClient.track).toHaveBeenCalledTimes(1);

      const properties = (mockMixpanelClient.track as jest.Mock).mock.calls[0][1];
      expect(properties).toMatchObject({
        anotherProperty: "another",
        error,
      });
    });
  });
});
