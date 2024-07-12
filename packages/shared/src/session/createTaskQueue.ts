import assert from "node:assert/strict";
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
  onAuthInfo,
  onDestroy,
  onPackageInfo,
}: {
  onAuthInfo?: (authInfo: AuthInfo | undefined) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
  onPackageInfo?: (packageInfo: PackageInfo) => void | Promise<void>;
}): TaskQueue {
  let didAuthenticate: boolean = false;
  let didSendPackageInfo: boolean = false;
  let authInfo: AuthInfo | undefined;
  let queue: Set<Queued> = new Set();

  waitForPackageInfo().then(packageInfo => {
    didSendPackageInfo = true;

    if (onPackageInfo) {
      onPackageInfo(packageInfo);
    }
  });

  waitForAuthInfo().then(resolved => {
    authenticate(resolved);
    flush();
  });

  function authenticate(value: AuthInfo | undefined) {
    if (!didAuthenticate) {
      didAuthenticate = true;
      authInfo = value;

      if (onAuthInfo) {
        onAuthInfo(authInfo);
      }
    }
  }

  async function flush() {
    assert(didSendPackageInfo, "Package info must be sent before flushing tasks");

    if (!didAuthenticate) {
      authenticate(undefined);
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
    if (queue.size > 0) {
      await flush();
    }

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

    if (didAuthenticate) {
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
    flushAndClose,
    push,
    get queueSize() {
      return queue.size;
    },
  };
}
