import type { Test } from "./reporter";

export function buildTestId(
  sourcePath: string,
  test: Pick<Test, "id" | "source">
): Promise<string> {
  return generateOpaqueId([sourcePath, test.id, ...test.source.scope, test.source.title].join("-"));
}

export async function generateOpaqueId(contents: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-1", enc.encode(contents));
  return Array.from(new Uint8Array(hash))
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
}
