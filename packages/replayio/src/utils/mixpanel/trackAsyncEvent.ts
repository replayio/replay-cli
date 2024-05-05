import { debug } from "./debug";
import { trackEvent } from "./trackEvent";
import { EventProperties } from "./types";

export async function trackAsyncEvent<Type>(
  promise: Promise<Type>,
  eventName: string,
  properties?: EventProperties | ((result: Type | undefined, error: any) => EventProperties)
): Promise<Type> {
  debug(`trackAsyncEvent: "${eventName}" (awaiting promise) %j`, properties);

  const startTime = Date.now();

  let result: Type | undefined = undefined;
  let succeeded = false;
  let thrown: any = undefined;
  try {
    result = await promise;

    succeeded = true;
  } catch (error) {
    thrown = error;
  }

  const endTime = Date.now();

  trackEvent(eventName, {
    ...(typeof properties === "function" ? properties(result, thrown) : properties),
    duration: endTime - startTime,
    succeeded,
  });

  if (succeeded) {
    return result as Type;
  } else {
    throw thrown;
  }
}
