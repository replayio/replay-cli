import { createDeferred } from "../async/createDeferred";
import { isPromiseLike } from "../async/isPromiseLike";
import { timeoutAfter } from "../async/timeoutAfter";
import { AuthInfo } from "../authentication/types";
import { PackageInfo } from "./types";
import { waitForAuthInfo } from "./waitForAuthInfo";
import { waitForPackageInfo } from "./waitForPackageInfo";

export type Task = (authInfo: AuthInfo | undefined) => void | Promise<void>;
export type TaskQueue = {
  flushAndClose(): void;
  push(task: Task): void;
  get queueSize(): number;
};
export type Queued = {
  deferred: ReturnType<typeof createDeferred>;
  status: "waiting" | "running" | "finished";
  task: Task;
};

const FLUSH_TIMEOUT = 500;

export function createTaskQueue({
  onDestroy,
  onInitialize,
}: {
  onDestroy: () => void | Promise<void>;
  onInitialize: ({
    authInfo,
    packageInfo,
  }: {
    authInfo: AuthInfo | null;
    packageInfo: PackageInfo;
  }) => void | Promise<void>;
}): TaskQueue {
  let cachedAuthInfo: AuthInfo | null | undefined;
  let cachedPackageInfo: PackageInfo | undefined;
  let destroyed = false;
  let initialized = false;
  let queue: Set<Queued> = new Set();

  waitForPackageInfo().then(packageInfo => {
    cachedPackageInfo = packageInfo;

    if (cachedAuthInfo !== undefined) {
      initialized = true;

      onInitialize({
        authInfo: cachedAuthInfo,
        packageInfo: cachedPackageInfo,
      });

      flush();
    }
  });

  waitForAuthInfo().then(authInfo => {
    cachedAuthInfo = authInfo ?? null;

    if (cachedPackageInfo !== undefined) {
      initialized = true;

      onInitialize({
        authInfo: cachedAuthInfo,
        packageInfo: cachedPackageInfo,
      });

      flush();
    }
  });

  async function flush() {
    if (!initialized && cachedPackageInfo !== undefined) {
      initialized = true;

      onInitialize({
        authInfo: cachedAuthInfo || null,
        packageInfo: cachedPackageInfo,
      });
    }

    const clonedQueue = Array.from(queue);
    const promises = clonedQueue.map(queued => {
      if (queued.status === "waiting") {
        runTask(queued);
      }

      return queued.deferred.promise;
    });

    await Promise.race([timeoutAfter(FLUSH_TIMEOUT, false), Promise.all(promises)]);
  }

  async function flushAndClose() {
    if (destroyed) {
      return;
    }

    destroyed = true;

    if (queue.size > 0) {
      await flush();
    }

    await onDestroy();
  }

  function push(task: Task) {
    const queued: Queued = {
      deferred: createDeferred(),
      status: "waiting",
      task,
    };

    queue.add(queued);

    if (initialized) {
      runTask(queued);
    }
  }

  async function runTask(queued: Queued) {
    const { deferred, task } = queued;

    try {
      queued.status = "running";

      const maybePromise = task(cachedAuthInfo || undefined);
      if (isPromiseLike(maybePromise)) {
        await maybePromise;
      }
    } catch {
    } finally {
      deferred.resolve();

      queued.status = "finished";

      queue.delete(queued);
    }
  }

  return {
    flushAndClose,
    push,
    get queueSize() {
      return queue.size;
    },
  };
}
