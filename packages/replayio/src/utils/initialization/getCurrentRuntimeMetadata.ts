import { readFromCache } from "@replay-cli/shared/cache";
import { metadataPath } from "../installation/config";
import { MetadataJSON, Runtime } from "../installation/types";

export function getCurrentRuntimeMetadata(runtime: Runtime) {
  const metadata = readFromCache<MetadataJSON>(metadataPath);
  return metadata?.[runtime];
}
