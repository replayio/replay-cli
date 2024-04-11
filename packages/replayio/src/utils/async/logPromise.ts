import { dots } from "cli-spinners";
import { isDebugging } from "../../config";
import { logUpdate } from "../logUpdate";
import { statusFailed, statusPending, statusSuccess } from "../theme";
import { STATUS_PENDING, STATUS_REJECTED, STATUS_RESOLVED, Status } from "./createDeferred";

export async function logPromise(
  promise: Promise<any>,
  options: {
    delayBeforeLoggingMs?: number;
    messages: {
      failed?: string;
      pending: string;
      success?: string;
    };
  }
) {
  const { delayBeforeLoggingMs = 0, messages } = options;

  let dotIndex = 0;
  let status: Status = STATUS_PENDING;

  let logAfter = Date.now() + delayBeforeLoggingMs;

  const print = () => {
    let message;
    let prefix;
    switch (status) {
      case STATUS_PENDING:
        if (!isDebugging && delayBeforeLoggingMs > 0 && Date.now() < logAfter) {
          return;
        }

        message = messages.pending;
        prefix = statusPending(dots.frames[++dotIndex % dots.frames.length]);
        break;
      case STATUS_REJECTED:
        message = messages.failed;
        prefix = statusFailed("✘");
        break;
      case STATUS_RESOLVED:
        message = messages.success;
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
    await promise;

    status = STATUS_RESOLVED;
  } catch (error) {
    status = STATUS_REJECTED;
  }

  clearInterval(interval);

  print();

  logUpdate.done();
}
