import { UnstructuredMetadata } from "@replay-cli/shared/recording/types";
import * as source from "@replay-cli/shared/recording/metadata/legacy/source";
export * from "@replay-cli/shared/recording/metadata/legacy/source";

export function validate(metadata: { source?: UnstructuredMetadata } = {}) {
  return source.validate(metadata.source);
}
