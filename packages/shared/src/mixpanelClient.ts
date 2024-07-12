import { Callback, PropertyDict, init as initMixpanel } from "mixpanel";
import { disableMixpanel, mixpanelToken } from "./config";
import { logDebug, logError } from "./logger";
import { createTaskQueue } from "./session/createTaskQueue";
import { PackageInfo } from "./session/types";

export type Properties = Record<string, unknown>;

type MixpanelExternal = ReturnType<typeof initMixpanel>;

export type MixpanelImplementation = {
  init: MixpanelExternal["init"];
  track: (eventName: string, properties: PropertyDict, callback: Callback) => void;
};

let additionalProperties: Properties = {};
let mixpanelClient: MixpanelImplementation | undefined;
let packageName: string | undefined;
let packageVersion: string | undefined;

if (!disableMixpanel) {
  mixpanelClient = initMixpanel(mixpanelToken);
}

const taskQueue = createTaskQueue({
  onPackageInfo: (packageInfo: PackageInfo) => {
    packageName = packageInfo.packageName;
    packageVersion = packageInfo.packageVersion;
  },
});

export function appendAdditionalProperties(properties: Properties) {
  Object.assign(additionalProperties, properties);
}

export async function closeMixpanel() {
  await taskQueue.flushAndClose();
}

export function createAsyncFunctionWithTracking<Params extends Array<any>, Type>(
  createPromise: (...args: Params) => Promise<Type>,
  eventName: string,
  properties?: Properties | ((result: Type | undefined, error: any) => Properties)
): (...args: Params) => Promise<Type> {
  return (...args: Params) => trackAsyncEvent(createPromise(...args), eventName, properties);
}

export function getQueueSizeForTests(): number {
  return taskQueue.queueSize;
}

export function mockForTests(mock: MixpanelImplementation | undefined) {
  mixpanelClient = mock;
}

export async function trackAsyncEvent<Type>(
  promise: Promise<Type>,
  eventName: string,
  properties: Properties | ((result: Type | undefined, error: any) => Properties) = {}
) {
  logDebug(`Waiting to log Mixpanel event "${eventName}" (awaiting promise)`, {
    eventName,
    properties,
  });

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

export function trackEvent(eventName: string, properties: Properties = {}) {
  if (packageName) {
    const prefix = `${packageName}.`;
    if (!eventName.startsWith(prefix)) {
      eventName = prefix + eventName;
    }
  }

  // This method does not await the deferred/promise
  // because it is meant to be used in a fire-and-forget manner
  // The application will wait for all pending events to be resolved before exiting
  taskQueue.push(async authInfo => {
    logDebug("MixpanelClient:AddToQueue:SendMessage", { eventName, properties });

    const mergedProperties = {
      ...properties,
      ...additionalProperties,
      packageName: packageName,
      packageVersion: packageVersion,
    } as Properties;

    if (authInfo?.id) {
      mergedProperties.distinct_id = authInfo.id;
    }

    mixpanelClient?.track(eventName, mergedProperties, (error: any | undefined) => {
      if (error) {
        logError("MixpanelClient:AddToQueue:Failed", { eventName, error, properties });
      } else {
        logDebug("MixpanelClient:AddToQueue:Success", { eventName, properties });
      }
    });
  });
}
