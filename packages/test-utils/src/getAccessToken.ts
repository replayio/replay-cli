import { logDebug } from "@replay-cli/shared/logger";
import { ReplayReporterConfig } from "./types";

export function getAccessToken(config?: ReplayReporterConfig<any>) {
  if (config?.apiKey) {
    logDebug("Using token from reporter config (config.apiKey)");
    return config.apiKey;
  } else if (process.env.REPLAY_API_KEY) {
    logDebug("Using token from env (REPLAY_API_KEY)");
    return process.env.REPLAY_API_KEY;
  } else if (process.env.RECORD_REPLAY_API_KEY) {
    logDebug("Using token from env (RECORD_REPLAY_API_KEY)");
    return process.env.RECORD_REPLAY_API_KEY;
  }
}
