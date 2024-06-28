import { trackAsyncEvent } from "./trackAsyncEvent";
import { Properties } from "./types";

export function withTrackAsyncEvent<Params extends Array<any>, Type>(
  createPromise: (...args: Params) => Promise<Type>,
  eventName: string,
  properties?: Properties | ((result: Type | undefined, error: any) => Properties)
): (...args: Params) => Promise<Type> {
  return (...args: Params) => trackAsyncEvent(createPromise(...args), eventName, properties);
}
