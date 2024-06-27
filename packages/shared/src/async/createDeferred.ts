export const STATUS_PENDING = "pending";
export const STATUS_REJECTED = "rejected";
export const STATUS_RESOLVED = "resolved";

export type StatusPending = typeof STATUS_PENDING;
export type StatusRejected = typeof STATUS_REJECTED;
export type StatusResolved = typeof STATUS_RESOLVED;

export interface Deferred<Type, Data = undefined> {
  data: Data;
  debugLabel: string | undefined;
  promise: Promise<Type>;
  rejection: Error | undefined;
  reject(error: Error): void;
  rejectIfPending(error: Error): void;
  resolve(value?: Type): void;
  resolveIfPending(value?: Type): void;
  resolution: Type | undefined;
  status: StatusPending | StatusRejected | StatusResolved;
}

type Status = StatusPending | StatusRejected | StatusResolved;
export { type Status };

export function createDeferred<Type, Data>(data: Data, debugLabel?: string): Deferred<Type, Data>;
export function createDeferred<Type, Data = undefined>(
  data?: Data,
  debugLabel?: string
): Deferred<Type, Data | undefined>;
export function createDeferred<Type, Data>(
  data?: Data,
  debugLabel?: string
): Deferred<Type, Data | undefined> {
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

  const deferred: Deferred<Type, Data | undefined> = {
    data,
    debugLabel,

    promise,

    reject(error: Error) {
      assertPending();

      deferred.rejectIfPending(error);
    },
    rejectIfPending(error: Error) {
      if (status === STATUS_PENDING) {
        rejection = error;
        status = STATUS_REJECTED;

        rejectPromise(error);
      }
    },

    resolve(value: Type) {
      assertPending();

      deferred.resolveIfPending(value);
    },
    resolveIfPending(value: Type) {
      if (status === STATUS_PENDING) {
        resolution = value;
        status = STATUS_RESOLVED;

        resolvePromise(value);
      }
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
