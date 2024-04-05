export const STATUS_NOT_FOUND = "not-found";
export const STATUS_PENDING = "pending";
export const STATUS_ABORTED = "aborted";
export const STATUS_REJECTED = "rejected";
export const STATUS_RESOLVED = "resolved";

export type StatusNotFound = typeof STATUS_NOT_FOUND;
export type StatusPending = typeof STATUS_PENDING;
export type StatusAborted = typeof STATUS_ABORTED;
export type StatusRejected = typeof STATUS_REJECTED;
export type StatusResolved = typeof STATUS_RESOLVED;

export interface Deferred<Type, Data = void> {
  data: Data | undefined;
  debugLabel: string | undefined;
  promise: Promise<Type>;
  rejection: Error | undefined;
  reject(error: Error): void;
  resolve(value?: Type): void;
  resolution: Type | undefined;
  status: StatusPending | StatusRejected | StatusResolved;
}

export type Status =
  | StatusNotFound
  | StatusPending
  | StatusAborted
  | StatusRejected
  | StatusResolved;

export function createDeferred<Type, Data = void>(
  data?: Data,
  debugLabel?: string
): Deferred<Type, Data> {
  let rejection: Error | undefined = undefined;
  let resolution: Type | undefined = undefined;
  let status: StatusPending | StatusRejected | StatusResolved = STATUS_PENDING;

  let rejectPromise: (error: Error) => void;
  let resolvePromise: (value: Type | PromiseLike<Type>) => void;

  const promise = new Promise<Type>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  promise.catch(() => {
    // Prevent unhandled promise rejection warning.
  });

  function assertPending() {
    if (status !== STATUS_PENDING) {
      throw Error(`Deferred has already been ${status}`);
    }
  }

  const deferred: Deferred<Type, Data> = {
    data,
    debugLabel,

    promise,

    reject(error: Error) {
      assertPending();

      rejection = error;
      status = STATUS_REJECTED;

      rejectPromise(error);
    },

    resolve(value: Type) {
      assertPending();

      resolution = value;
      status = STATUS_RESOLVED;

      resolvePromise(value);
    },

    get status() {
      return status;
    },

    get rejection() {
      return rejection;
    },

    get resolution() {
      return resolution;
    },
  };

  return deferred;
}
