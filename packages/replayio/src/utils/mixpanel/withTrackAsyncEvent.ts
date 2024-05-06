import { trackAsyncEvent } from "./trackAsyncEvent";
import { EventProperties } from "./types";

export function withTrackAsyncEvent<Params extends Array<any>, Type>(
  createPromise: (...args: Params) => Promise<Type>,
  eventName: string,
  properties?: EventProperties | ((result: Type | undefined, error: any) => EventProperties)
): (...args: Params) => Promise<Type> {
  return (...args: Params) => trackAsyncEvent(createPromise(...args), eventName, properties);
}
