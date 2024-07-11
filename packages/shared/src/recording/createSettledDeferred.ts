import { createDeferred } from "../async/createDeferred";
import { logDebug } from "../logger";

export function createSettledDeferred<Data>(data: Data, task: () => Promise<void>) {
  const deferred = createDeferred<boolean, Data>(data);

  task().then(
    () => {
      deferred.resolve(true);
    },
    error => {
      logDebug("Deferred action failed", { data, error });

      deferred.resolve(false);
    }
  );

  return deferred;
}
