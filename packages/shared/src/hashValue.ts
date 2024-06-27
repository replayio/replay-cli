import { createHash } from "crypto";

export function hashValue(value: string) {
  const hash = createHash("sha256");
  hash.write(value);
  return hash.digest("hex").toString();
}
