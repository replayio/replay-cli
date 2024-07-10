import { createDeferred } from "../async/createDeferred";
import { AuthInfo } from "../authentication/types";
import { PackageInfo } from "./types";

export const deferredAuthInfo = createDeferred<AuthInfo | null>();
export const deferredPackageInfo = createDeferred<PackageInfo>();
