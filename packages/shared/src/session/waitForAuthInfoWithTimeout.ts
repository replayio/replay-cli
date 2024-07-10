import { raceWithTimeout } from "../async/raceWithTimeout";
import { WAIT_FOR_AUTH_INFO_TIMEOUT } from "./config";
import { deferredAuthInfo } from "./deferred";

const promise = raceWithTimeout(deferredAuthInfo.promise, WAIT_FOR_AUTH_INFO_TIMEOUT);

export async function waitForAuthInfoWithTimeout() {
  const authInfo = await promise;

  return authInfo ?? null;
}
