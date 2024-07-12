import { STATUS_RESOLVED } from "../async/createDeferred";
import { getAuthInfo } from "../authentication/getAuthInfo";
import { AuthInfo } from "../authentication/types";
import { logError } from "../logger";
import { deferredAuthInfo } from "./waitForAuthInfo";
import { deferredPackageInfo } from "./waitForPackageInfo";

export async function initializeSession({
  accessToken,
  packageName,
  packageVersion,
}: {
  accessToken: string | undefined;
  packageName: string;
  packageVersion: string;
}) {
  if (deferredPackageInfo.status !== STATUS_RESOLVED) {
    deferredPackageInfo.resolve({ packageName, packageVersion });
  }

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
