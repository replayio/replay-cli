import { waitForPackageInfo } from "./waitForPackageInfo";

export async function getUserAgent() {
  const { packageName, packageVersion } = await waitForPackageInfo();

  return `${packageName}/${packageVersion}`;
}
