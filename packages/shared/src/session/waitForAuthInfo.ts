import { createDeferred } from "../async/createDeferred";
import { AuthInfo } from "../authentication/types";

export const deferredAuthInfo = createDeferred<AuthInfo | undefined>();

export async function waitForAuthInfo() {
  return await deferredAuthInfo.promise;
}
