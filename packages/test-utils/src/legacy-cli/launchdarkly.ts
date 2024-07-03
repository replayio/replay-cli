import { logger } from "@replay-cli/shared/logger";
import { initialize, LDClient, LDLogger } from "launchdarkly-node-client-sdk";

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
  private client: LDClient | undefined;

  public initialize() {
    const key = "60ca05fb43d6f10d234bb3cf";
    const defaultProfile = { type: "anonymous", id: "anonymous" };
    this.client = initialize(
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
    return this;
  }

  public async identify(profile: FeatureProfile): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.waitForInitialization();
    } catch (error) {
      logger.error("LaunchDarklyIdentify:InitializationFailed", { error });
      return;
    }

    await this.client.identify({
      kind: "user",
      key: profile.id,
      anonymous: profile.type === "anonymous",
    });
  }

  public async isEnabled(flag: string, defaultValue: boolean): Promise<boolean> {
    if (!this.client) {
      return defaultValue;
    }
    return await this.variant(flag, defaultValue);
  }

  public async variant<T>(name: string, defaultValue: T): Promise<T> {
    if (!this.client) {
      return defaultValue;
    }
    try {
      await this.client.waitForInitialization();
    } catch (error) {
      logger.error("LaunchDarklyVariant:WaitForInitializationFailed", { error });
      return defaultValue;
    }

    const val = await this.client.variation(name, defaultValue);
    return val;
  }

  public async close() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.close();
    } catch (error) {
      logger.error("LaunchDarklyClose:Failed", { error });
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
