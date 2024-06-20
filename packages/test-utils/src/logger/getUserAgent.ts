// TODO [PRO-629] Move this into the "shared" package.

import { name, version } from "../../package.json";

export function getUserAgent() {
  return `${name}/${version}`;
}
