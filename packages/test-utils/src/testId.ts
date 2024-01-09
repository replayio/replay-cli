import type { Test } from "./reporter";

export async function buildTestId(
  sourcePath: string,
  test: Pick<Test, "id" | "source">
): Promise<string> {
  const id = await generateOpaqueId(
    [sourcePath, test.id, ...test.source.scope, test.source.title].join("-")
  );

  return id;
}

export async function generateOpaqueId(contents: string): Promise<string> {
  if (globalThis.crypto) {
    // In the browser, use the global crypto obj to generate the sha-1 hash
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-1", enc.encode(contents));
    return Array.from(new Uint8Array(hash))
      .map(v => v.toString(16).padStart(2, "0"))
      .join("");
  } else {
    // In node, rely on the crypto package instead
    return require("crypto").createHash("sha1").update(contents).digest("hex");
  }
}
