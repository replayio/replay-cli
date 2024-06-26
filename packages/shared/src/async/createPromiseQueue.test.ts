import { timeoutAfter } from "@replay-cli/shared/async/timteoutAfter";
import { createPromiseQueue } from "./createPromiseQueue";

function asyncSpy(implementation: () => unknown = () => {}) {
  return jest.fn().mockImplementation(async () => implementation());
}

describe("createPromiseQueue", () => {
  it("should start jobs immediately before hitting the concurrency limit", () => {
    const queue = createPromiseQueue({ concurrency: 3 });

    const job1 = asyncSpy();
    const job2 = asyncSpy();
    const job3 = asyncSpy();

    queue.add(job1);
    queue.add(job2);
    queue.add(job3);

    expect(job1).toHaveBeenCalled();
    expect(job2).toHaveBeenCalled();
    expect(job3).toHaveBeenCalled();
  });

  it("should not start a job immediately after hitting the concurrency limit", () => {
    const queue = createPromiseQueue({ concurrency: 2 });

    const job1 = asyncSpy();
    const job2 = asyncSpy();
    const job3 = asyncSpy();

    queue.add(job1);
    queue.add(job2);
    queue.add(job3);

    expect(job3).not.toHaveBeenCalled();
  });

  it("should start a next job after going below the concurrency limit", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });

    const job1 = asyncSpy();
    const job2 = asyncSpy();
    const job3 = asyncSpy();

    queue.add(job1);
    const queudJob2 = queue.add(job2);
    queue.add(job3);

    expect(job3).not.toHaveBeenCalled();

    await queudJob2;

    expect(job3).toHaveBeenCalled();
  });

  it("a queued job should resolve with its original result", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });

    const job = asyncSpy(() => 42);
    const queuedJob = queue.add(job);

    await expect(queuedJob).resolves.toBe(42);
  });

  it("a queued job should reject with its original error", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const error = new Error("My error.");

    const job = asyncSpy(() => {
      throw error;
    });
    const queuedJob = queue.add(job);

    await expect(queuedJob).rejects.toBe(error);
  });

  it("should be possible to wait until the queue becomes idle", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const spy = jest.fn();

    queue.add(() => timeoutAfter(10));
    const idle = queue.waitUntilIdle().then(spy);
    queue.add(() => timeoutAfter(20));

    await timeoutAfter(15);
    expect(spy).not.toHaveBeenCalled();

    await expect(idle).resolves.toBe(undefined);
  });

  it("should be possible to wait until the overflown queue becomes idle", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const spy = jest.fn();

    queue.add(() => timeoutAfter(10));
    queue.add(() => timeoutAfter(10));
    // those 2 should be executed in the next "batch" so they should resolve after 20 ms from the start
    queue.add(() => timeoutAfter(10));
    queue.add(() => timeoutAfter(10));

    const idle = queue.waitUntilIdle().then(spy);

    await timeoutAfter(15);
    expect(spy).not.toHaveBeenCalled();

    await expect(idle).resolves.toBe(undefined);
  });

  it("should resolve the idle promise immediately when it has no queued jobs", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const idle = queue.waitUntilIdle();

    await expect(idle).resolves.toBe(undefined);
  });

  it("should start a job in a subqueue immediately before the root hits the concurrency limit", () => {
    const queue = createPromiseQueue({ concurrency: 3 });
    const subqueue = queue.fork();

    const job1 = asyncSpy();
    const job2 = asyncSpy();
    const job3 = asyncSpy();

    queue.add(job1);
    subqueue.add(job2);
    subqueue.add(job3);

    expect(job2).toHaveBeenCalled();
    expect(job3).toHaveBeenCalled();
  });

  it("should not start a job in a subqueue immediately after the root hits the concurrency limit", () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const subqueue = queue.fork();

    const job1 = asyncSpy();
    const job2 = asyncSpy();
    const job3 = asyncSpy();

    queue.add(job1);
    subqueue.add(job2);
    subqueue.add(job3);

    expect(job3).not.toHaveBeenCalled();
  });

  it("a queued job in a subqueue should resolve with its original result", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const subqueue = queue.fork();

    const job = asyncSpy(() => 42);
    const queuedJob = subqueue.add(job);

    await expect(queuedJob).resolves.toBe(42);
  });

  it("a queued job in a subqueue should reject with its original error", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const subqueue = queue.fork();
    const error = new Error("My error.");

    const job = asyncSpy(() => {
      throw error;
    });
    const queuedJob = subqueue.add(job);

    await expect(queuedJob).rejects.toBe(error);
  });

  it("should resolve the idle promise of a subqueue immediately when it has no queued jobs but the root has some", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const subqueue = queue.fork();
    const spy = jest.fn();

    queue.add(asyncSpy(() => timeoutAfter(10)));
    queue.add(asyncSpy(() => timeoutAfter(10)));

    subqueue.waitUntilIdle().then(spy);

    await timeoutAfter(0);
    expect(spy).toHaveBeenCalled();
  });

  it("should resolve the idle promise of a subqueue when its jobs complete without waiting for other root jobs", async () => {
    const queue = createPromiseQueue({ concurrency: 2 });
    const subqueue = queue.fork();
    const spy = jest.fn();

    subqueue.add(asyncSpy());
    subqueue.add(asyncSpy());
    queue.add(asyncSpy(() => timeoutAfter(10)));
    queue.add(asyncSpy(() => timeoutAfter(10)));

    subqueue.waitUntilIdle().then(spy);

    await timeoutAfter(0);
    expect(spy).toHaveBeenCalled();
  });
});
