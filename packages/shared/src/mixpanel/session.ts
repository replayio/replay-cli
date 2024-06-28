import { createDeferred } from "../async/createDeferred";
import { DefaultProperties } from "./types";

export const defaultProperties: DefaultProperties = {
  packageName: "",
  packageVersion: "",
};

export const deferredSession = createDeferred<string | undefined>();

export function configureSession(id: string | undefined, properties: DefaultProperties) {
  Object.assign(defaultProperties, properties);

  if (id) {
    defaultProperties.distinct_id = id;
  }

  deferredSession.resolveIfPending(id);
}
