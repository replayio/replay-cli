import dbg from "./debug";
import { initialize, LDClient, LDLogger } from "launchdarkly-node-client-sdk";

const debug = dbg("replay:launchdarkly");

type UserFeatureProfile = {
  type: "user";
  id: string;
};

type AnonymousFeatureProfile = {
  type: "anonymous";
  id: "anonymous";
};

type FeatureProfile = AnonymousFeatureProfile | UserFeatureProfile;

class NoOpLogger implements LDLogger {
  error() {}
  warn() {}
  info() {}
  debug() {}
}

class LaunchDarkly {
  private client: LDClient;

  constructor() {
    this.client = LaunchDarkly.initializeClient();
  }

  private static initializeClient() {
    const key = "60ca05fb43d6f10d234bb3cf";
    const defaultProfile = { type: "anonymous", id: "anonymous" };
    return initialize(
      key,
      {
        kind: "user",
        key: defaultProfile.id,
        anonymous: defaultProfile.type === "anonymous",
      },
      {
        logger: new NoOpLogger(),
      }
    );
  }

  public async identify(profile: FeatureProfile): Promise<void> {
    try {
      await this.client.waitForInitialization();
    } catch (e) {
      debug("Failed to wait for LaunchDarkly initialization %j", e);
      return;
    }

    await this.client.identify({
      kind: "user",
      key: profile.id,
      anonymous: profile.type === "anonymous",
    });
  }

  public async isEnabled(flag: string, defaultValue: boolean): Promise<boolean> {
    return await this.variant(flag, defaultValue);
  }

  public async variant<T>(name: string, defaultValue: T): Promise<T> {
    try {
      await this.client.waitForInitialization();
    } catch (e) {
      debug("Failed to wait for LaunchDarkly initialization %j", e);
      return defaultValue;
    }

    const val = await this.client.variation(name, defaultValue);
    return val;
  }

  public async close() {
    try {
      await this.client.close();
    } catch (e) {
      debug("Failed to close LaunchDarkly client %j", e);
    }
  }
}

let launchDarkly: LaunchDarkly | undefined;
export const getLaunchDarkly = () => {
  if (launchDarkly) {
    return launchDarkly;
  }
  launchDarkly = new LaunchDarkly();
  return launchDarkly;
};
