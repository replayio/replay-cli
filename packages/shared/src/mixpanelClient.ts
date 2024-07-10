import { Callback, PropertyDict, init as initMixpanel } from "mixpanel";
import { disableMixpanel, mixpanelToken } from "./config";
import { logger } from "./logger";
import { AuthenticatedTaskQueue } from "./session/AuthenticatedTaskQueue";
import { PackageInfo } from "./session/types";

export type Properties = Record<string, unknown>;

type MixpanelExternal = ReturnType<typeof initMixpanel>;

export type MixpanelImplementation = {
  init: MixpanelExternal["init"];
  track: (eventName: string, properties: PropertyDict, callback: Callback) => void;
};

class MixpanelClient extends AuthenticatedTaskQueue {
  private _additionalProperties: Properties = {};
  private _mixpanelClient: MixpanelImplementation | undefined;
  private _packageName: string | undefined;
  private _packageVersion: string | undefined;

  constructor() {
    super();

    if (!disableMixpanel) {
      this._mixpanelClient = initMixpanel(mixpanelToken);
    }
  }

  onAuthenticate() {
    // No-op
  }

  async onFinalize() {
    // No-op
  }

  async onInitialize({ packageName, packageVersion }: PackageInfo) {
    this._packageName = packageName;
    this._packageVersion = packageVersion;
  }

  appendAdditionalProperties(additionalProperties: Properties) {
    Object.assign(this._additionalProperties, additionalProperties);
  }

  mockForTests(mock: MixpanelImplementation | undefined) {
    this._mixpanelClient = mock;
  }

  createAsyncFunctionWithTracking<Params extends Array<any>, Type>(
    createPromise: (...args: Params) => Promise<Type>,
    eventName: string,
    properties?: Properties | ((result: Type | undefined, error: any) => Properties)
  ): (...args: Params) => Promise<Type> {
    return (...args: Params) => this.trackAsyncEvent(createPromise(...args), eventName, properties);
  }

  async trackAsyncEvent<Type>(
    promise: Promise<Type>,
    eventName: string,
    properties: Properties | ((result: Type | undefined, error: any) => Properties) = {}
  ) {
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
    if (this._packageName) {
      const prefix = `${this._packageName}.`;
      if (!eventName.startsWith(prefix)) {
        eventName = prefix + eventName;
      }
    }

    // This method does not await the deferred/promise
    // because it is meant to be used in a fire-and-forget manner
    // The application will wait for all pending events to be resolved before exiting
    super.addToQueue(async authInfo => {
      logger.debug("MixpanelClient:AddToQueue:SendMessage", { eventName, properties });

      this._mixpanelClient?.track(
        eventName,
        {
          ...properties,
          ...this._additionalProperties,
          distinct_id: authInfo?.id,
          packageName: this._packageName,
          packageVersion: this._packageVersion,
        },
        (error: any | undefined) => {
          if (error) {
            logger.error("MixpanelClient:AddToQueue:Failed", { eventName, error, properties });
          } else {
            logger.debug("MixpanelClient:AddToQueue:Success", { eventName, properties });
          }
        }
      );
    });
  }
}

export const mixpanelClient = new MixpanelClient();
