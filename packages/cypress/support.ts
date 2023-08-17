import register from "./src/support";
import { PluginFeature, isFeatureEnabled } from "./src/features";

if (isFeatureEnabled(Cypress.env("REPLAY_PLUGIN_FEATURES"), PluginFeature.Support)) {
  register();
}
