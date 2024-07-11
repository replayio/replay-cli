import {
  initialize as initializeLDClient,
  LDClient,
  LDContext,
  LDSingleKindContext,
} from "launchdarkly-node-client-sdk";
import { createDeferred } from "./async/createDeferred";
import { AuthInfo } from "./authentication/types";
import { getReplayPath } from "./getReplayPath";
import { createTaskQueue } from "./session/createTaskQueue";

let clientDeferred = createDeferred<LDClient>();

const taskQueue = createTaskQueue({
  onAuthInfo: (authInfo: AuthInfo | undefined) => {
    let context: LDContext = {
      anonymous: true,
    };
    if (authInfo) {
      context = {
        anonymous: false,
        key: authInfo.id,
        kind: authInfo.type,
      } satisfies LDSingleKindContext;
    }

    const client = initializeLDClient("60ca05fb43d6f10d234bb3cf", context, {
      localStoragePath: getReplayPath("launchdarkly-user-cache"),
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    });

    clientDeferred.resolve(client);
  },
  onDestroy: async () => {
    const client = clientDeferred.resolution;
    if (client) {
      await client.close();
    }
  },
});

export async function close() {
  taskQueue.flushAndClose();
}

export async function getFeatureFlagValue<Type>(flag: string, defaultValue: Type) {
  await clientDeferred.promise;

  const client = clientDeferred.resolution;
  if (client) {
    await client.waitForInitialization();

    const value = await client.variation(flag, defaultValue);

    return value as Type;
  }

  return defaultValue;
}
