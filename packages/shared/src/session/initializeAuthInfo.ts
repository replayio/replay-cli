import { STATUS_RESOLVED } from "../async/createDeferred";
import { getAuthInfo } from "../authentication/getAuthInfo";
import { AuthInfo } from "../authentication/types";
import { logError } from "../logger";
import { deferredAuthInfo } from "./waitForAuthInfo";

export async function initializeAuthInfo({ accessToken }: { accessToken: string | undefined }) {
  if (deferredAuthInfo.status !== STATUS_RESOLVED) {
    let authInfo: AuthInfo | undefined = undefined;
    if (accessToken) {
      try {
        authInfo = await getAuthInfo(accessToken);
      } catch (error) {
        logError("InitializeSession:AuthInfoQueryFailed", { error });
      }
    }

    deferredAuthInfo.resolve(authInfo);
  }
}
