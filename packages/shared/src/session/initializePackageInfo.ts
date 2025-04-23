import { STATUS_RESOLVED } from "../async/createDeferred";
import { deferredPackageInfo } from "./waitForPackageInfo";

export async function initializePackageInfo({
  packageName,
  packageVersion,
}: {
  packageName: string;
  packageVersion: string;
}) {
  if (deferredPackageInfo.status !== STATUS_RESOLVED) {
    deferredPackageInfo.resolve({ packageName, packageVersion });
  }
}
