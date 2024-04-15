import { join } from "path";
import { runtimeMetadata, runtimePath } from "../installation/config";

export function getBrowserPath() {
  return join(runtimePath, ...runtimeMetadata.path);
}
