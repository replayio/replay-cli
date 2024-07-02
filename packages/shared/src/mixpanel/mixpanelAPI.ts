import { Callback, PropertyDict, init as initMixpanel } from "mixpanel";
import { STATUS_PENDING, createDeferred } from "../async/createDeferred";
import { timeoutAfter } from "../async/timeoutAfter";
import { disableMixpanel, mixpanelToken } from "../config";
import { getAuthInfo } from "../graphql/getAuthInfo";
import { logger } from "../logger";

export type Properties = Record<string, unknown>;

type MixpanelExternal = ReturnType<typeof initMixpanel>;

export type MixpanelImplementation = {
  init: MixpanelExternal["init"];
  track: (eventName: string, properties: PropertyDict, callback: Callback) => void;
};

class MixpanelAPI {
  private _additionalProperties: Properties = {};
  private _mixpanelAPI: MixpanelImplementation | undefined;
  private _packageName: string | undefined;
  private _packageVersion: string | undefined;
  private _pendingEvents: Set<Promise<any>> = new Set();
  private _sessionId: string | undefined;
  private _waiter = createDeferred();

  constructor() {
    if (!disableMixpanel) {
      this._mixpanelAPI = initMixpanel(mixpanelToken);
    }
  }

  appendAdditionalProperties(additionalProperties: Properties) {
    Object.assign(this._additionalProperties, additionalProperties);
  }

  async close() {
    if (this._waiter.status !== STATUS_PENDING) {
      await Promise.race([timeoutAfter(500, false), Promise.all(Array.from(this._pendingEvents))]);
    }
  }

  mockForTests(mock: MixpanelImplementation | undefined) {
    this._mixpanelAPI = mock;
  }

  async initialize({
    additionalProperties = {},
    accessToken,
    packageName,
    packageVersion,
  }: {
    additionalProperties?: Properties;
    accessToken: string | undefined;
    packageName: string;
    packageVersion: string;
  }) {
    if (this._waiter.status !== STATUS_PENDING) {
      logger.warn("Mixpanel already initialized", {
        additionalProperties,
        accessToken,
        packageName,
        packageVersion,
      });

      return;
    }

    logger.debug("Initializing Mixpanel", { accessToken });

    this._packageName = packageName;
    this._packageVersion = packageVersion;

    Object.assign(this._additionalProperties, additionalProperties);

    if (accessToken) {
      try {
        const { id } = await getAuthInfo(accessToken);

        logger.debug(`Setting Mixpanel session id to ${id}`);

        this._sessionId = id;
      } catch (error) {
        logger.warn("Could not load Mixpanel session", { accessToken, error });
      }
    }

    this._waiter.resolve();
  }

  get pendingEventsCount() {
    return this._pendingEvents.size;
  }

  async trackAsyncEvent<Type>(
    promise: Promise<Type>,
    eventName: string,
    properties: Properties | ((result: Type | undefined, error: any) => Properties) = {}
  ) {
    if (!this._mixpanelAPI) {
      return await promise;
    }

    logger.debug(`Waiting to log Mixpanel event "${eventName}" (awaiting promise)`, {
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

    this.trackEvent(eventName, {
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

  trackEvent(eventName: string, properties: Properties = {}) {
    if (!this._mixpanelAPI) {
      return;
    }

    if (this._packageName) {
      const prefix = `${this._packageName}.`;
      if (!eventName.startsWith(prefix)) {
        eventName = prefix + eventName;
      }
    }

    logger.debug(`Logging Mixpanel event "${eventName}"`, { eventName, properties });

    // This method does not await the deferred/promise
    // because it is meant to be used in a fire-and-forget manner
    // The application will wait for all pending events to be resolved before exiting
    this._trackEventImplementation(eventName, properties);
  }

  async waitForInitialization() {
    return this._waiter.promise;
  }

  private async _trackEventImplementation(eventName: string, properties: Properties) {
    const deferredEvent = createDeferred<boolean, string>(eventName);

    this._pendingEvents.add(deferredEvent.promise);

    // Wait until initialization completes before sending events
    if (this._waiter.status === STATUS_PENDING) {
      await this._waiter.promise;
    }

    this._mixpanelAPI?.track(
      eventName,
      {
        ...properties,
        ...this._additionalProperties,
        distinct_id: this._sessionId,
        packageName: this._packageName,
        packageVersion: this._packageVersion,
      },
      (error: any) => {
        if (error) {
          logger.warn(`Mixpanel event "${eventName}" failed`, { eventName, error, properties });
        } else {
          logger.debug(`Mixpanel event "${eventName}" successfully logged`, {
            eventName,
            properties,
          });
        }

        deferredEvent.resolve(!error);

        this._pendingEvents.delete(deferredEvent.promise);
      }
    );
  }
}

export const mixpanelAPI = new MixpanelAPI();
