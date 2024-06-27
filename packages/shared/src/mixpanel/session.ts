import { createDeferred } from "../async/createDeferred";

export const defaultProperties: Record<string, any> = {};

export const deferredSession = createDeferred<string | undefined>();

export function configureSession(id: string | undefined, properties: Record<string, any> = {}) {
  Object.assign(defaultProperties, properties);

  if (id) {
    defaultProperties.distinct_id = id;
  }

  deferredSession.resolveIfPending(id);
}
