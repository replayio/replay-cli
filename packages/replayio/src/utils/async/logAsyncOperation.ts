import {
  STATUS_PENDING,
  STATUS_REJECTED,
  STATUS_RESOLVED,
  Status,
} from "@replay-cli/shared/async/createDeferred";
import { statusFailed, statusPending, statusSuccess } from "@replay-cli/shared/theme";
import { dots } from "cli-spinners";
import { disableAnimatedLog } from "../../config";
import { logUpdate } from "@replay-cli/shared/logUpdate";

export type LogProgressOptions = { delayBeforeLoggingMs?: number };

export function logAsyncOperation(
  initialMessage: string,
  { delayBeforeLoggingMs = 0 }: LogProgressOptions = {}
) {
  let dotIndex = 0;
  let logAfter = Date.now() + delayBeforeLoggingMs;
  let status: Status = STATUS_PENDING;
  let displayedMessage = initialMessage;

  const print = () => {
    let prefix: string = "";
    switch (status) {
      case STATUS_PENDING:
        if (!disableAnimatedLog && delayBeforeLoggingMs > 0 && Date.now() < logAfter) {
          return;
        }

        prefix = statusPending(dots.frames[++dotIndex % dots.frames.length]);
        break;
      case STATUS_REJECTED:
        prefix = statusFailed("✘");
        break;
      case STATUS_RESOLVED:
        prefix = statusSuccess("✔");
        break;
    }

    if (displayedMessage) {
      logUpdate(`${prefix} ${displayedMessage}`);
    } else {
      logUpdate.clear();
    }
  };

  print();

  const interval = disableAnimatedLog ? undefined : setInterval(print, dots.interval);

  function assertPending() {
    if (status !== STATUS_PENDING) {
      throw Error(`logProgress is already in ${status} state`);
    }
  }

  const finalize = () => {
    clearInterval(interval);
    print();
    logUpdate.done();
  };

  return {
    setFailed: (message: string) => {
      assertPending();
      status = STATUS_REJECTED;
      displayedMessage = message;
      finalize();
    },
    setPending: (message: string) => {
      assertPending();
      displayedMessage = message;
      print();
    },
    setSuccess: (message: string) => {
      assertPending();
      status = STATUS_RESOLVED;
      displayedMessage = message;
      finalize();
    },
  };
}
