import path from "path";
import { getDirectory } from "@replayio/replay/src/utils";

import ReplayReporter from "./reporter";

export function getMetadataFilePath(workerIndex = 0) {
  return path.join(getDirectory(), `JEST_METADATA_${workerIndex}`);
}

export {
  ReplayReporter
};
