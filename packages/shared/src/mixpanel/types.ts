import { init as initMixpanel } from "mixpanel";

export type MixpanelAPI = Pick<ReturnType<typeof initMixpanel>, "init" | "track">;

export type DefaultProperties = {
  packageName: string;
  packageVersion: string;
} & Record<string, unknown>;

export type Properties = Record<string, unknown>;
