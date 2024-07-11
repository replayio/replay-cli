import { createDeferred } from "../async/createDeferred";
import { isPromiseLike } from "../async/isPromiseLike";
import { timeoutAfter } from "../async/timeoutAfter";
import { AuthInfo } from "../authentication/types";
import { FLUSH_TIMEOUT } from "./config";
import { deferredPackageInfo } from "./deferred";
import { PackageInfo } from "./types";
import { waitForAuthInfoWithTimeout } from "./waitForAuthInfoWithTimeout";

export type Task = (authInfo: AuthInfo | undefined) => void | Promise<void>;

type Queued = {
  deferred: ReturnType<typeof createDeferred>;
  status: "waiting" | "running" | "finished";
  task: Task;
};

export type TaskQueue = {
  get queueSize(): number;
  flush(): void;
  flushAndClose(): void;
  push(task: Task): void;
};

export function createTaskQueue({
  onAuthInfo,
  onDestroy,
  onPackageInfo,
}: {
  onAuthInfo?: (authInfo: AuthInfo | undefined) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
  onPackageInfo?: (packageInfo: PackageInfo) => void | Promise<void>;
}): TaskQueue {
  let authenticated: boolean = false;
  let authInfo: AuthInfo | undefined;
  let queue: Set<Queued> = new Set();

  deferredPackageInfo.promise.then(packageInfo => {
    if (onPackageInfo) {
      onPackageInfo(packageInfo);
    }
  });

  waitForAuthInfoWithTimeout().then(resolved => {
    authenticated = true;
    authInfo = resolved;

    if (onAuthInfo) {
      onAuthInfo(authInfo);
    }

    flush();
  });

  async function flush() {
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
    await flush();

    if (onDestroy) {
      await onDestroy();
    }
  }

  function push(task: Task) {
    const queued: Queued = {
      deferred: createDeferred(),
      status: "waiting",
      task,
    };

    queue.add(queued);

    if (authenticated) {
      runTask(queued);
    }
  }

  async function runTask(queued: Queued) {
    const { deferred, task } = queued;

    try {
      queued.status = "running";

      const maybePromise = task(authInfo);
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
    get queueSize() {
      return queue.size;
    },
    flush,
    flushAndClose,
    push,
  };
}
