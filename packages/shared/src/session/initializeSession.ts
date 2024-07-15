import { initializeAuthInfo } from "./initializeAuthInfo";
import { initializePackageInfo } from "./initializePackageInfo";

export async function initializeSession({
  accessToken,
  packageName,
  packageVersion,
}: {
  accessToken: string | undefined;
  packageName: string;
  packageVersion: string;
}) {
  await initializePackageInfo({ packageName, packageVersion });
  await initializeAuthInfo({ accessToken });
}
