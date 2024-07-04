export { sanitizeMetadata as sanitize } from "@replay-cli/shared/recording/metadata/sanitizeMetadata";
export { addMetadata as add } from "@replay-cli/shared/recording/metadata/addMetadata";
import * as source from "@replay-cli/shared/recording/metadata/legacy/source";
import * as test from "@replay-cli/shared/recording/metadata/legacy/test/index";
export { source, test };
