import { STATUS_RESOLVED } from "../async/createDeferred";
import { getAuthInfo } from "../authentication/getAuthInfo";
import { AuthInfo } from "../authentication/types";
import { deferredAuthInfo, deferredPackageInfo } from "./deferred";

export async function initializeSession({
  accessToken,
  packageName,
  packageVersion,
}: {
  accessToken: string | undefined;
  packageName: string;
  packageVersion: string;
}) {
  if (deferredPackageInfo.status === STATUS_RESOLVED) {
    return;
  }

  deferredPackageInfo.resolve({ packageName, packageVersion });

  let authInfo: AuthInfo | undefined = undefined;
  if (accessToken) {
    authInfo = await getAuthInfo(accessToken);
  }

  deferredAuthInfo.resolve(authInfo);
}
