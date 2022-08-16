import path from "path";
import { getDirectory } from "@replayio/replay/src/utils";

import ReplayRunner from "./runner";

export function getMetadataFilePath(workerIndex = 0) {
  return path.join(getDirectory(), `JEST_METADATA_${workerIndex}`);
}

export { ReplayRunner };
