import { ReplayReporterConfig } from "./types";

export function getAccessToken(config?: ReplayReporterConfig<any>) {
  return config?.apiKey || process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY;
}
