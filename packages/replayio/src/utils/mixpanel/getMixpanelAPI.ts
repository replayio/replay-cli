import { init as initMixpanel } from "mixpanel";
import { disableMixpanel, mixpanelToken } from "../../config";
import { MixpanelAPI } from "./types";

let mixpanelAPI: MixpanelAPI | undefined;

export function getMixpanelAPI() {
  if (!disableMixpanel) {
    if (mixpanelAPI == null) {
      mixpanelAPI = initMixpanel(mixpanelToken);
    }
  }

  return mixpanelAPI;
}

export function setMixpanelAPIForTests(mock: MixpanelAPI | undefined) {
  mixpanelAPI = mock;
}
