import { createDeferred } from "@replay-cli/shared/async/createDeferred";
import { version as currentVersion } from "../../../package.json";

export const defaultProperties: Record<string, any> = {
  packageVersion: currentVersion,
};

export const deferredSession = createDeferred<string | undefined>();

export function configureSession(id: string | undefined) {
  if (id) {
    defaultProperties.distinct_id = id;
  }

  deferredSession.resolveIfPending(id);
}
