import { createDeferred } from "../async/createDeferred";
import type { TaskQueue } from "./createTaskQueue";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("createTaskQueue", () => {
  let mockGetAuthInfo: jest.Mock;
  let taskQueue: TaskQueue;
  let taskQueueOnAuthInfo: jest.Mock;
  let taskQueueOnDestroy: jest.Mock;
  let taskQueueOnPackageInfo: jest.Mock;

  async function initializeSession() {
    const { initializeSession } = require("./initializeSession");

    await initializeSession({
      accessToken: "fake-access-token",
      packageName: "fake-package-name",
      packageVersion: "0.0.0",
    });
  }

  async function initializeSessionPackageInfoOnly() {
    const { waitForPackageInfo } = require("./waitForPackageInfo");

    mockGetAuthInfo.mockReturnValue(new Promise(resolve => {}));

    // Don't await the whole session initialization, just the package info
    initializeSession();

    await waitForPackageInfo();
  }

  beforeEach(() => {
    jest.useFakeTimers();

    mockGetAuthInfo = jest.fn(async () => ({
      id: "fake-session-id",
    }));

    // This test should not talk to our live GraphQL server
    jest.mock("../authentication/getAuthInfo", () => ({
      getAuthInfo: mockGetAuthInfo,
    }));

    taskQueueOnAuthInfo = jest.fn();
    taskQueueOnDestroy = jest.fn();
    taskQueueOnPackageInfo = jest.fn();

    // jest.resetModules does not work with import; only works with require()
    const { createTaskQueue } = require("./createTaskQueue");

    taskQueue = createTaskQueue({
      onAuthInfo: taskQueueOnAuthInfo,
      onDestroy: taskQueueOnDestroy,
      onPackageInfo: taskQueueOnPackageInfo,
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should call onPackageInfo once package info is available", async () => {
    expect(taskQueueOnAuthInfo).not.toHaveBeenCalled();
    expect(taskQueueOnPackageInfo).not.toHaveBeenCalled();

    await initializeSessionPackageInfoOnly();

    expect(taskQueueOnAuthInfo).not.toHaveBeenCalled();
    expect(taskQueueOnPackageInfo).toHaveBeenCalledTimes(1);
  });

  it("should call onAuthInfo once auth info is available", async () => {
    expect(taskQueueOnAuthInfo).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskQueueOnAuthInfo).toHaveBeenCalledTimes(1);
  });

  it("should call onDestroy during shutdown", async () => {
    expect(taskQueueOnDestroy).not.toHaveBeenCalled();

    await taskQueue.flushAndClose();

    expect(taskQueueOnDestroy).toHaveBeenCalledTimes(1);
  });

  it("should flush queued tasks once authenticated", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();
    const taskC = jest.fn();

    taskQueue.push(taskA);
    taskQueue.push(taskB);

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);

    taskQueue.push(taskC);

    expect(taskC).toHaveBeenCalledTimes(1);
  });

  it("should flush queue without authentication if requested", async () => {
    await initializeSessionPackageInfoOnly();

    const taskA = jest.fn();
    const taskB = jest.fn();

    taskQueue.push(taskA);
    taskQueue.push(taskB);

    expect(taskQueueOnAuthInfo).not.toHaveBeenCalled();
    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await taskQueue.flushAndClose();

    // It should lazily initialize without auth info before flushing
    expect(taskQueueOnAuthInfo).toHaveBeenCalledTimes(1);

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should only flush a task once", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();

    taskQueue.push(taskA);

    expect(taskA).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskA).toHaveBeenCalledTimes(1);

    taskQueue.push(taskB);

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);

    await taskQueue.flushAndClose();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should track pending promises until resolved or rejected", async () => {
    const { createDeferred } = require("../async/createDeferred");

    const deferredA = createDeferred();
    const deferredB = createDeferred();
    const deferredC = createDeferred();

    taskQueue.push(async () => {
      await deferredA.promise;
    });
    taskQueue.push(async () => {
      await deferredB.promise;
    });
    taskQueue.push(async () => {
      await deferredC.promise;
    });
    expect(taskQueue.queueSize).toBe(3);

    await initializeSession();
    expect(taskQueue.queueSize).toBe(3);

    await act(async () => deferredA.resolve());
    expect(taskQueue.queueSize).toBe(2);

    const closePromise = taskQueue.flushAndClose();
    expect(taskQueue.queueSize).toBe(2);

    await act(async () => deferredB.reject(new Error("Fake error")));
    expect(taskQueue.queueSize).toBe(1);

    await act(async () => deferredC.resolve());
    expect(taskQueue.queueSize).toBe(0);

    await closePromise;
  });
});
