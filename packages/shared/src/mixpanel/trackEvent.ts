import { STATUS_PENDING, createDeferred } from "../async/createDeferred";
import { logger } from "../logger";
import { getMixpanelAPI } from "./getMixpanelAPI";
import { addPendingEvent, removePendingEvent } from "./pendingEvents";
import { defaultProperties, deferredSession } from "./session";
import { MixpanelAPI, Properties } from "./types";

export function trackEvent(eventName: string, properties: Properties = {}) {
  const mixpanelAPI = getMixpanelAPI();
  if (!mixpanelAPI) {
    return;
  }

  const prefix = defaultProperties.packageName ? `${defaultProperties.packageName}.` : "";
  if (prefix && !eventName.startsWith(prefix)) {
    eventName = prefix + eventName;
  }

  logger.debug(`trackEvent: "${eventName}"`, { properties });

  // This method does not await the deferred/promise
  // because it is meant to be used in a fire-and-forget manner
  // The application will wait for all pending events to be resolved before exiting
  trackEventImplementation(mixpanelAPI, eventName, properties);
}

async function trackEventImplementation(
  mixpanelAPI: MixpanelAPI,
  eventName: string,
  properties: Properties
) {
  const deferredEvent = createDeferred<boolean, string>(eventName);

  addPendingEvent(deferredEvent.promise);

  // Wait until user auth completed before tracking events
  if (deferredSession.status === STATUS_PENDING) {
    await deferredSession.promise;
  }

  mixpanelAPI.track(
    eventName,
    {
      ...properties,
      ...defaultProperties,
    },
    (error: any) => {
      if (error) {
        logger.debug(`trackEvent: "${eventName}" -> failed:`, { error });
      } else {
        logger.debug(`trackEvent: "${eventName}" -> success`);
      }

      deferredEvent.resolve(!error);

      removePendingEvent(deferredEvent.promise);
    }
  );
}
