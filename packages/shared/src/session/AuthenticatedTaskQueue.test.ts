import { createDeferred } from "../async/createDeferred";
import type { AuthenticatedTaskQueue as AuthenticatedTaskQueueType } from "./AuthenticatedTaskQueue";
import { waitForAuthInfoWithTimeout } from "./waitForAuthInfoWithTimeout";

async function act(callback: () => void | Promise<void>) {
  await callback();
  await Promise.resolve();
}

describe("AuthenticatedTaskQueue", () => {
  let AuthenticatedTaskQueue: typeof AuthenticatedTaskQueueType;
  let test: AuthenticatedTaskQueueType & {
    append: AuthenticatedTaskQueueType["addToQueue"];
    authenticateMock: jest.Mock;
    finalizeMock: jest.Mock;
    initializeMock: jest.Mock;
  };

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

    // jest.resetModules does not work with import; only works with require()
    AuthenticatedTaskQueue = require("./AuthenticatedTaskQueue").AuthenticatedTaskQueue;

    class Test extends AuthenticatedTaskQueue {
      initializeMock: jest.Mock<any, any>;
      authenticateMock: jest.Mock<any, any>;
      finalizeMock: jest.Mock<any, any>;

      constructor() {
        const initializeMock = jest.fn();
        const authenticateMock = jest.fn();
        const finalizeMock = jest.fn();
        super({
          onInitialize: initializeMock,
          onAuthenticate: authenticateMock,
          onFinalize: finalizeMock,
        });
        this.initializeMock = initializeMock;
        this.authenticateMock = authenticateMock;
        this.finalizeMock = finalizeMock;
      }

      append = super.addToQueue;
    }

    test = new Test();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("should initialize subclass once package info is available", async () => {
    expect(test.authenticateMock).not.toHaveBeenCalled();
    expect(test.initializeMock).not.toHaveBeenCalled();

    await initializeSession();

    expect(test.authenticateMock).toHaveBeenCalledTimes(1);
    expect(test.initializeMock).toHaveBeenCalledTimes(1);
  });

  it("should finalize subclass during shutdown", async () => {
    expect(test.finalizeMock).not.toHaveBeenCalled();

    await test.close();

    expect(test.finalizeMock).toHaveBeenCalledTimes(1);
  });

  it("should flush queued tasks once authenticated", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();
    const taskC = jest.fn();

    test.append(taskA);
    test.append(taskB);

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await initializeSession();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);

    test.append(taskC);

    expect(taskC).toHaveBeenCalledTimes(1);
  });

  it("should flush queue without authentication if requested", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();

    test.append(taskA);
    test.append(taskB);

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    await test.close();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("should only flush a task once", async () => {
    const taskA = jest.fn();
    const taskB = jest.fn();

    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    test.append(taskA);

    await test.close();

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).not.toHaveBeenCalled();

    test.append(taskB);

    await test.close();

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

    test.append(async () => {
      await deferredA.promise;
    });
    test.append(async () => {
      await deferredB.promise;
    });
    test.append(async () => {
      await deferredC.promise;
    });
    expect(test.queueSize).toBe(3);

    await initializeSession();
    expect(test.queueSize).toBe(3);

    await act(async () => deferredA.resolve());
    expect(test.queueSize).toBe(2);

    const closePromise = test.close();
    expect(test.queueSize).toBe(2);

    await act(async () => deferredB.reject(new Error("Fake error")));
    expect(test.queueSize).toBe(1);

    await act(async () => deferredC.resolve());
    expect(test.queueSize).toBe(0);

    await closePromise;
  });
});
