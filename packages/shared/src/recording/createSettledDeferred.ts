import { createDeferred } from "../async/createDeferred";
import { logger } from "../logger";

export function createSettledDeferred<Data>(data: Data, task: () => Promise<void>) {
  const deferred = createDeferred<boolean, Data>(data);

  task().then(
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
