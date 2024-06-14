export function decodeBase64(id?: string | null) {
  if (!id) {
    return null;
  }

  return Buffer.from(id, "base64").toString();
}
