import type { TaskQueue } from "./createTaskQueue";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("createTaskQueue", () => {
  let mockGetAuthInfo: jest.Mock;
  let taskQueue: TaskQueue;
  let taskQueueOnDestroy: jest.Mock;
  let taskQueueOnInitialize: jest.Mock;

  async function initializeAuthInfoOnly() {
    const { initializeAuthInfo } = require("./initializeAuthInfo");

    await initializeAuthInfo({
      accessToken: "fake-access-token",
    });
  }

  async function initializePackageInfoOnly() {
    const { initializePackageInfo } = require("./initializePackageInfo");

    await initializePackageInfo({
      packageName: "fake-package-name",
      packageVersion: "0.0.0",
    });
  }

  async function initializeSession() {
    await initializeAuthInfoOnly();
    await initializePackageInfoOnly();
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

    taskQueueOnDestroy = jest.fn();
    taskQueueOnInitialize = jest.fn();

    // jest.resetModules does not work with import; only works with require()
    const { createTaskQueue } = require("./createTaskQueue");

    taskQueue = createTaskQueue({
      onDestroy: taskQueueOnDestroy,
      onInitialize: taskQueueOnInitialize,
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should call onInitialize once package and auth info are available", async () => {
    expect(taskQueueOnInitialize).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskQueueOnInitialize).toHaveBeenCalledTimes(1);
  });

  it("should not call onInitialize if only package info is available", async () => {
    expect(taskQueueOnInitialize).not.toHaveBeenCalled();

    await initializePackageInfoOnly();

    expect(taskQueueOnInitialize).not.toHaveBeenCalled();
  });

  it("should not call onInitialize if only auth info is available", async () => {
    expect(taskQueueOnInitialize).not.toHaveBeenCalled();

    await initializeAuthInfoOnly();

    expect(taskQueueOnInitialize).not.toHaveBeenCalled();
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
    await initializePackageInfoOnly();

    const taskA = jest.fn();
    const taskB = jest.fn();

    taskQueue.push(taskA);
    taskQueue.push(taskB);

    expect(taskQueueOnInitialize).not.toHaveBeenCalled();
    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await taskQueue.flushAndClose();

    // It should lazily initialize without auth info before flushing
    expect(taskQueueOnInitialize).toHaveBeenCalledTimes(1);

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should warn if queue is flushed without package info", async () => {
    const task = jest.fn();

    taskQueue.push(task);

    expect(taskQueueOnInitialize).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();

    await taskQueue.flushAndClose();

    expect(taskQueueOnInitialize).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
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
