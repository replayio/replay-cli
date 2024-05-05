import { init as initMixpanel } from "mixpanel";

export type MixpanelAPI = Pick<ReturnType<typeof initMixpanel>, "init" | "track">;

export type EventProperties = Record<string, any>;
