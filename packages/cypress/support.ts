import register from "./src/support";
import { PluginFeature, isFeatureEnabled } from "./src/features";

declare global {
  interface Window {
    __RECORD_REPLAY_CYPRESS_SUPPORT_HOOK_INSTALLED__?: true;
  }
}

if (isFeatureEnabled(Cypress.env("REPLAY_PLUGIN_FEATURES"), PluginFeature.Support)) {
  register();
}
