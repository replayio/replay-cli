import { createDeferred } from "../async/createDeferred";
import { PackageInfo } from "./types";

export const deferredPackageInfo = createDeferred<PackageInfo>();

export async function waitForPackageInfo() {
  return await deferredPackageInfo.promise;
}
