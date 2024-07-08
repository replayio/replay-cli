import { UnstructuredMetadata } from "@replay-cli/shared/recording/types";
import * as test from "@replay-cli/shared/recording/metadata/legacy/test/index";
export * from "@replay-cli/shared/recording/metadata/legacy/test/index";

export function validate(metadata: { test?: UnstructuredMetadata } = {}) {
  return test.validate(metadata.test);
}
