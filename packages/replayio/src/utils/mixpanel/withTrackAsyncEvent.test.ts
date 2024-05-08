import { Deferred, createDeferred } from "../async/createDeferred";
import { MixpanelAPI } from "./types";

describe("withTrackAsyncEvent", () => {
  let mockMixpanelAPI: MixpanelAPI;
  let withTrackAsyncEvent: typeof import("./withTrackAsyncEvent").withTrackAsyncEvent;

  beforeEach(() => {
    mockMixpanelAPI = {
      init: jest.fn(),
      track: jest.fn(),
    };

    // jest.resetModules does not work with import; only works with require()
    withTrackAsyncEvent = require("./withTrackAsyncEvent").withTrackAsyncEvent;

    require("./session").configureSession("fake-user-id");
    require("./getMixpanelAPI").setMixpanelAPIForTests(mockMixpanelAPI);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should pass arguments along to trackAsyncEvent", async () => {
    const deferred = createDeferred<string>();

    const mockGetProperties = jest.fn((result: any, error: any) => ({
      error,
      result,
      anotherProperty: "another",
    }));

    const callbackWithTracking = withTrackAsyncEvent(
      () => deferred.promise,
      "test-event",
      mockGetProperties
    );

    const promise = callbackWithTracking();

    expect(mockGetProperties).not.toHaveBeenCalled();

    deferred.resolve("result");

    await expect(promise).resolves.toEqual("result");

    expect(mockGetProperties).toHaveBeenCalledTimes(1);
    expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

    const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
    expect(properties).toMatchObject({
      anotherProperty: "another",
      distinct_id: "fake-user-id",
      error: undefined,
      result: "result",
    });
  });

  it("should pass arguments along to the decorated method", async () => {
    const mockGetProperties = jest.fn((result: any, error: any) => ({
      error,
      result,
    }));

    const callbackWithTracking = withTrackAsyncEvent(
      (foo, bar) => Promise.resolve({ foo, bar }),
      "test-event",
      mockGetProperties
    );

    const promise = callbackWithTracking("abc", 123);
    await expect(promise).resolves.toEqual({ foo: "abc", bar: 123 });

    expect(mockGetProperties).toHaveBeenCalledTimes(1);
    expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);

    const properties = (mockMixpanelAPI.track as jest.Mock).mock.calls[0][1];
    expect(properties).toMatchObject({
      distinct_id: "fake-user-id",
      error: undefined,
      result: { foo: "abc", bar: 123 },
    });
  });

  it("should track each function call separately", async () => {
    const deferredArray: Deferred<string>[] = [];

    const mockGetProperties = jest.fn((result: any) => ({
      result,
    }));

    const callbackWithTracking = withTrackAsyncEvent(
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
    expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(1);
    expect((mockMixpanelAPI.track as jest.Mock).mock.calls[0][1]).toMatchObject({
      result: "second",
    });

    deferredArray[0].resolve("first");
    await expect(promise1).resolves.toEqual("first");

    expect(mockGetProperties).toHaveBeenCalledTimes(2);
    expect(mockMixpanelAPI.track).toHaveBeenCalledTimes(2);
    expect((mockMixpanelAPI.track as jest.Mock).mock.calls[1][1]).toMatchObject({
      result: "first",
    });
  });
});
