import { logger } from "../logger";
import { trackEvent } from "./trackEvent";
import { Properties } from "./types";

export async function trackAsyncEvent<Type>(
  promise: Promise<Type>,
  eventName: string,
  properties?: Properties | ((result: Type | undefined, error: any) => Properties)
): Promise<Type> {
  logger.debug(`trackAsyncEvent: "${eventName}" (awaiting promise)`, { eventName, properties });

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
