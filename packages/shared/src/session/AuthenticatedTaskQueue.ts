import { createDeferred } from "../async/createDeferred";
import { isPromiseLike } from "../async/isPromiseLike";
import { timeoutAfter } from "../async/timeoutAfter";
import { AuthInfo } from "../authentication/types";
import { FLUSH_TIMEOUT } from "./config";
import { deferredPackageInfo } from "./deferred";
import { PackageInfo } from "./types";
import { waitForAuthInfoWithTimeout } from "./waitForAuthInfoWithTimeout";

type Task = (authInfo: AuthInfo | null) => void | Promise<void>;
type Queued = {
  deferred: ReturnType<typeof createDeferred>;
  status: "waiting" | "running" | "finished";
  task: Task;
};

// Note this is the base class used by the (Grafana) Logger
// It should avoid calling the logger itself– to prevent circular (import) references
// and also to reduce the risk of infinite loops
export abstract class AuthenticatedTaskQueue {
  private authenticated: boolean = false;
  private authInfo: AuthInfo | null = null;
  private queue: Set<Queued> = new Set();

  constructor() {
    deferredPackageInfo.promise.then(packageInfo => {
      this.onInitialize(packageInfo);
    });

    waitForAuthInfoWithTimeout().then(authInfo => {
      this.authenticated = true;
      this.authInfo = authInfo;

      this.onAuthenticate(authInfo);
      this.flushQueue();
    });
  }

  async close() {
    await this.flushQueue();
    await this.onFinalize();
  }

  get queueSize() {
    return this.queue.size;
  }

  protected abstract onAuthenticate(authInfo: AuthInfo | null): void | Promise<void>;
  protected abstract onFinalize(): void | Promise<void>;
  protected abstract onInitialize(packageInfo: PackageInfo): void | Promise<void>;

  protected addToQueue(task: Task) {
    const queued: Queued = {
      deferred: createDeferred(),
      status: "waiting",
      task,
    };

    this.queue.add(queued);

    if (this.authenticated) {
      this.runTask(queued);
    }
  }

  protected async waitUntil(
    status: "initialized" | "initialized-and-authenticated"
  ): Promise<void> {
    await deferredPackageInfo.promise;

    if (status === "initialized-and-authenticated") {
      await waitForAuthInfoWithTimeout();
    }
  }

  private async flushQueue() {
    const queue = Array.from(this.queue);
    const promises = queue.map(queued => {
      if (queued.status === "waiting") {
        this.runTask(queued);
      }

      return queued.deferred.promise;
    });

    await Promise.race([timeoutAfter(FLUSH_TIMEOUT, false), Promise.all(promises)]);
  }

  private async runTask(queued: Queued) {
    const { deferred, task } = queued;

    try {
      queued.status = "running";

      const maybePromise = task(this.authInfo);
      if (isPromiseLike(maybePromise)) {
        await maybePromise;
      }
    } catch {
    } finally {
      deferred.resolve();

      queued.status = "finished";

      this.queue.delete(queued);
    }
  }
}
