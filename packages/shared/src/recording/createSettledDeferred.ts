import { createDeferred } from "../async/createDeferred";
import { logger } from "../logger";

export function createSettledDeferred<Data>(data: Data, promise: Promise<void>) {
  const deferred = createDeferred<boolean, Data>(data);

  promise.then(
    () => {
      deferred.resolve(true);
    },
    error => {
      logger.debug("Deferred action failed", { data, error });

      deferred.resolve(false);
    }
  );

  return deferred;
}
