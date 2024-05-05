import { createDeferred } from "../async/createDeferred";
import { MixpanelAPI } from "./types";

describe("trackAsyncEvent", () => {
  let mockMixpanelAPI: MixpanelAPI;
  let configureSession: typeof import("./session").configureSession;
  let trackAsyncEvent: typeof import("./trackAsyncEvent").trackAsyncEvent;

  beforeEach(() => {
    mockMixpanelAPI = {
      init: jest.fn(),
      track: jest.fn(),
    };

    jest.useFakeTimers();

    // jest.resetModules does not work with import; only works with require()
    configureSession = require("./session").configureSession;
    trackAsyncEvent = require("./trackAsyncEvent").trackAsyncEvent;

    require("./getMixpanelAPI").setMixpanelAPIForTests(mockMixpanelAPI);

    configureSession("fake-user-id");
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should return the result of the promise after logging", async () => {
    const deferred = createDeferred<string>();
    const promise = trackAsyncEvent(deferred.promise, "test");

    deferred.resolve("resolution");

    await expect(promise).resolves.toBe("resolution");
  });

  it("should return the result of the a void promise after logging", async () => {
    const deferred = createDeferred<void>();
    const promise = trackAsyncEvent(deferred.promise, "test");

    deferred.resolve();

    await expect(promise).resolves.toBe(undefined);
  });

  it("should re-throw a rejected promise error after logging", async () => {
    const deferred = createDeferred<string>();
    const promise = trackAsyncEvent(deferred.promise, "test");

    const error = new Error("error");
    deferred.reject(error);

    await expect(promise).rejects.toBe(error);
  });

  it("should log the duration and status (successful) of a successful promise", async () => {
    const deferred = createDeferred<string>();
    const promise = trackAsyncEvent(deferred.promise, "test");

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
    const promise = trackAsyncEvent(deferred.promise, "test");

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
    const promise = trackAsyncEvent(deferred.promise, "test", mockGetProperties);

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
    const promise = trackAsyncEvent(deferred.promise, "test", mockGetProperties);

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
