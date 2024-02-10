import type { Test } from "./reporter";
import sha1 from "sha-1";

export function buildTestId(sourcePath: string, test: Pick<Test, "id" | "source">): string {
  const id = generateOpaqueId(
    [sourcePath, test.id, ...test.source.scope, test.source.title].join("-")
  );

  return id;
}

export function generateOpaqueId(contents: string): string {
  if (globalThis.window) {
    // in the browser, we're using this sync sha-1 lib because the built-in
    // crypto is async which causes problems with Cypress
    return sha1(contents);
  } else {
    // In node, rely on the crypto package instead
    return require("crypto").createHash("sha1").update(contents).digest("hex");
  }
}
