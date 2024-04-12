import { dots } from "cli-spinners";
import { isDebugging } from "../../config";
import { logUpdate } from "../logUpdate";
import { statusFailed, statusPending, statusSuccess } from "../theme";
import { STATUS_PENDING, STATUS_REJECTED, STATUS_RESOLVED, createDeferred } from "./createDeferred";

export async function logPromise<PromiseType>(
  promise: Promise<PromiseType>,
  options: {
    delayBeforeLoggingMs?: number;
    messages: {
      failed?: string | ((error: Error) => string);
      pending: string;
      success?: string | ((result: PromiseType) => string);
    };
  }
) {
  const { delayBeforeLoggingMs = 0, messages } = options;

  let deferred = createDeferred<PromiseType>();
  let dotIndex = 0;
  let logAfter = Date.now() + delayBeforeLoggingMs;

  const print = () => {
    let message: string | undefined;
    let prefix: string;
    switch (deferred.status) {
      case STATUS_PENDING:
        if (!isDebugging && delayBeforeLoggingMs > 0 && Date.now() < logAfter) {
          return;
        }

        message = messages.pending;
        prefix = statusPending(dots.frames[++dotIndex % dots.frames.length]);
        break;
      case STATUS_REJECTED:
        message =
          typeof messages.failed === "function"
            ? messages.failed(deferred.rejection!)
            : messages.failed;
        prefix = statusFailed("✘");
        break;
      case STATUS_RESOLVED:
        message =
          typeof messages.success === "function"
            ? messages.success(deferred.resolution!)
            : messages.success;
        prefix = statusSuccess("✔");
        break;
    }

    if (message) {
      logUpdate(`${prefix} ${message}`);
    } else {
      logUpdate.clear();
    }
  };

  print();

  const interval = !isDebugging ? setInterval(print, dots.interval) : undefined;

  try {
    deferred.resolve(await promise);
  } catch (error) {
    deferred.reject(error as Error);
  }

  clearInterval(interval);

  print();

  logUpdate.done();
}
