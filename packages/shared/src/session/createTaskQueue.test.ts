import { createDeferred } from "../async/createDeferred";
import type { TaskQueue } from "./createTaskQueue";
import { waitForAuthInfoWithTimeout } from "./waitForAuthInfoWithTimeout";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("createTaskQueue", () => {
  let taskQueue: TaskQueue;
  let taskQueueOnAuthInfo: jest.Mock;
  let taskQueueOnDestroy: jest.Mock;
  let taskQueueOnPackageInfo: jest.Mock;

  async function initializeSession() {
    await require("../session/initializeSession").initializeSession({
      accessToken: "fake-access-token",
      packageName: "fake-package-name",
      packageVersion: "0.0.0",
    });

    // Let async task queue
    await waitForAuthInfoWithTimeout();
  }

  beforeEach(() => {
    jest.useFakeTimers();

    // This test should not talk to our live GraphQL server
    jest.mock("../authentication/getAuthInfo", () => ({
      getAuthInfo: async () => ({
        id: "fake-session-id",
      }),
    }));

    taskQueueOnAuthInfo = jest.fn();
    taskQueueOnDestroy = jest.fn();
    taskQueueOnPackageInfo = jest.fn();

    // jest.resetModules does not work with import; only works with require()
    const createTaskQueue = require("./createTaskQueue").createTaskQueue;

    taskQueue = createTaskQueue({
      onAuthInfo: taskQueueOnAuthInfo,
      onDestroy: taskQueueOnDestroy,
      onPackageInfo: taskQueueOnPackageInfo,
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should initialize subclass once package info is available", async () => {
    expect(taskQueueOnAuthInfo).not.toHaveBeenCalled();
    expect(taskQueueOnPackageInfo).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskQueueOnAuthInfo).toHaveBeenCalledTimes(1);
    expect(taskQueueOnPackageInfo).toHaveBeenCalledTimes(1);
  });

  it("should finalize subclass during shutdown", async () => {
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
    const taskA = jest.fn();
    const taskB = jest.fn();

    taskQueue.push(taskA);
    taskQueue.push(taskB);

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await taskQueue.flushAndClose();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should only flush a task once", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    taskQueue.push(taskA);

    await taskQueue.flushAndClose();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).not.toHaveBeenCalled();

    taskQueue.push(taskB);

    await taskQueue.flushAndClose();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);

    await initializeSession();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should track pending promises until resolved or rejected", async () => {
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
