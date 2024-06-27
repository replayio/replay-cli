// TODO [PRO-720] Consolidate with code in @replay-cli/shared/src/runtime

import { join } from "path";
import { runtimeMetadata, runtimePath } from "../installation/config";

export function getBrowserPath() {
  return join(runtimePath, ...runtimeMetadata.path);
}
