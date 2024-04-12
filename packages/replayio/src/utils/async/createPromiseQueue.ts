import { Deferred, createDeferred } from "./createDeferred";

interface PromiseQueueRoot {
  add: <T>(action: () => Promise<T>) => Promise<T>;
}

interface PromiseQueue extends PromiseQueueRoot {
  fork: () => PromiseQueue;
  waitUntilIdle: () => Promise<undefined>;
}

function createGroup(root: PromiseQueueRoot): PromiseQueue {
  let pendingCount = 0;
  let idleDeferred: Deferred<undefined> | undefined;

  return {
    add: <T>(action: () => Promise<T>) => {
      pendingCount++;
      const finalize = () => {
        pendingCount--;
        if (!pendingCount) {
          idleDeferred?.resolve();
          idleDeferred = undefined;
        }
      };
      return root.add(() =>
        action().then(
          result => {
            finalize();
            return result;
          },
          error => {
            finalize();
            throw error;
          }
        )
      );
    },
    fork: () => createGroup(root),
    waitUntilIdle: (): Promise<undefined> => {
      if (!pendingCount) {
        return Promise.resolve(undefined);
      }

      idleDeferred ??= createDeferred();
      return idleDeferred.promise;
    },
  };
}

/**
 * Creates a queue for adding async jobs to it. It won't run more actions at the same time than the set concurrency limit.
 * It has support for forking a group of tasks - the consumer might `await q.waitUntilIdle()` on such a forked group or the root queue.
 *
 * Error handling is the responsibility of the scheduled action.
 */
export function createPromiseQueue({ concurrency }: { concurrency: number }): PromiseQueue {
  const jobs: Array<{
    action: () => Promise<unknown>;
    deferred: Deferred<unknown>;
  }> = [];

  let activeCount = 0;

  function run() {
    if (activeCount === concurrency) {
      return;
    }

    const job = jobs.shift();

    if (!job) {
      return;
    }

    activeCount++;

    job.action().then(
      result => {
        activeCount--;
        job.deferred.resolve(result);
        run();
      },
      error => {
        activeCount--;
        job.deferred.reject(error);
        run();
      }
    );
  }

  // root group is still a group
  return createGroup({
    add: <T>(action: () => Promise<T>) => {
      const deferred = createDeferred<T>();
      jobs.push({ action, deferred });
      run();
      return deferred.promise;
    },
  });
}
