import { name, version } from "../package.js";

export function getUserAgent() {
  return `${name}/${version}`;
}
