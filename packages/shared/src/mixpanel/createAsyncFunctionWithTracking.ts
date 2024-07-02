import { mixpanelAPI, Properties } from "./mixpanelAPI";

export function createAsyncFunctionWithTracking<Params extends Array<any>, Type>(
  createPromise: (...args: Params) => Promise<Type>,
  eventName: string,
  properties?: Properties | ((result: Type | undefined, error: any) => Properties)
): (...args: Params) => Promise<Type> {
  return (...args: Params) =>
    mixpanelAPI.trackAsyncEvent(createPromise(...args), eventName, properties);
}
