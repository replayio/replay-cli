export function base64Decode(string: string) {
  return Buffer.from(string, "base64").toString();
}
