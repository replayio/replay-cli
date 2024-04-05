import { name, version } from "../../package.json";

export function getUserAgent() {
  return `${name}/${version}`;
}
