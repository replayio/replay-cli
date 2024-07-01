import { getReplayPath } from "./getReplayPath";

export function getObservabilityCachePath(...path: string[]) {
  return getReplayPath("observability-profile", ...path);
}
