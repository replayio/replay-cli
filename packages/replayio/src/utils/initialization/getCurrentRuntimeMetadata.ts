import { readFromCache } from "../cache.js";
import { metadataPath } from "../installation/config.js";
import { MetadataJSON, Runtime } from "../installation/types.js";

export function getCurrentRuntimeMetadata(runtime: Runtime) {
  const metadata = readFromCache<MetadataJSON>(metadataPath);
  return metadata?.[runtime];
}
