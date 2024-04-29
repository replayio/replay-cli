import { createDeferred } from "../async/createDeferred.js";
import { debug } from "./debug.js";

export function createSettledDeferred<Data>(data: Data, promise: Promise<void>) {
  const deferred = createDeferred<boolean, Data>(data);

  promise.then(
    () => {
      deferred.resolve(true);
    },
    error => {
      debug("Deferred action failed\n\n%o\n\n%o", data, error);

      deferred.resolve(false);
    }
  );

  return deferred;
}
