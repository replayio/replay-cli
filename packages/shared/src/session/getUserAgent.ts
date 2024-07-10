import { deferredPackageInfo } from "./deferred";

export async function getUserAgent() {
  const { packageName, packageVersion } = await deferredPackageInfo.promise;
  return `${packageName}/${packageVersion}`;
}
