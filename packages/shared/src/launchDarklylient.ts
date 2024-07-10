import {
  LDClient,
  LDContext,
  LDUser,
  initialize as initializeLDClient,
} from "launchdarkly-node-client-sdk";
import { AuthInfo } from "./authentication/types";
import { getReplayPath } from "./getReplayPath";
import { AuthenticatedTaskQueue } from "./session/AuthenticatedTaskQueue";

class LaunchDarklyClient extends AuthenticatedTaskQueue {
  private client: LDClient | undefined;

  onAuthenticate(authInfo: AuthInfo | null) {
    let context: LDContext = {
      anonymous: true,
    };
    if (authInfo) {
      context = {
        anonymous: false,
        key: authInfo.id,
        kind: authInfo.type,
      };
    }

    this.client = initializeLDClient("60ca05fb43d6f10d234bb3cf", context, {
      localStoragePath: getReplayPath("launchdarkly-user-cache"),
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    });
  }

  async onFinalize() {
    if (this.client) {
      await this.client.close();
    }
  }

  onInitialize() {
    // Np-op
  }

  async getFeatureFlagValue<Type>(flag: string, defaultValue: boolean) {
    await this.waitUntil("initialized-and-authenticated");

    await this.client?.waitForInitialization();

    return (await this.client?.variation(flag, defaultValue)) as Type;
  }
}

export const launchDarklyClient = new LaunchDarklyClient();
