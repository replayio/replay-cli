import dbg from "./debug";
import { initialize, LDClient, LDLogger, basicLogger } from "launchdarkly-node-client-sdk";

const debug = dbg("replay:launchdarkly");

export type UserFeatureProfile = {
  type: "user";
  id: string;
};
export type WorkspaceFeatureProfile = {
  type: "workspace";
  id: string;
};

export const AnonymousFeatureProfile = {
  type: "anonymous",
  id: "anonymous",
};

export type FeatureProfile =
  | typeof AnonymousFeatureProfile
  | UserFeatureProfile
  | WorkspaceFeatureProfile;

class NoOpLogger implements LDLogger {
  error() {}
  warn() {}
  info() {}
  debug() {}
}

class LaunchDarkly {
  private client: LDClient;
  private initialized = true;
  private lastCall = Date.now();

  constructor() {
    this.client = LaunchDarkly.initializeClient();
  }

  private static initializeClient() {
    const key = "60ca05fb43d6f10d234bb3cf";
    const defaultProfile = AnonymousFeatureProfile;
    return initialize(
      key,
      {
        kind: "user",
        key: `${defaultProfile.type}:${defaultProfile.id}`,
        anonymous: defaultProfile.type === "anonymous",
      },
      {
        logger: new NoOpLogger(),
      }
    );
  }

  private async reinitialize() {
    this.client = LaunchDarkly.initializeClient();
    this.initialized = true;
    // try to re-close the connection after we have re-initialized
    setTimeout(this.reClose.bind(this), 5000).unref();
  }

  private async reClose() {
    // If we've gone more than 5 seconds with a call to `variant`, re-close the connection
    if (Date.now() - this.lastCall > 5000 && this.initialized) {
      this.close();
    } else {
      setTimeout(this.reClose.bind(this), 5000).unref();
    }
  }

  public async identify(profile: FeatureProfile): Promise<void> {
    if (!this.initialized) {
      this.reinitialize();
    }

    try {
      await this.client.waitForInitialization();
    } catch (e) {
      debug("Failed to wait for LaunchDarkly initialization %j", e);
      return;
    }

    await this.client.identify({
      kind: "user",
      key: `${profile.type}:${profile.id}`,
      anonymous: profile.type === "anonymous",
    });
  }

  public async isEnabled(flag: string, defaultValue: boolean): Promise<boolean> {
    return await this.variant(flag, defaultValue);
  }

  public async variant<T>(name: string, defaultValue: T): Promise<T> {
    if (!this.initialized) {
      this.reinitialize();
    }

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
    await this.client.close();
    this.initialized = false;
  }
}

export const launchDarkly = new LaunchDarkly();
