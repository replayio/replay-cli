// TODO [PRO-629] Move this into the "shared" package.

import { ensureFileSync, existsSync, readFileSync, removeSync, writeFileSync } from "fs-extra";

export function readFromCache<Type>(path: string): Type | undefined {
  if (existsSync(path)) {
    try {
      const text = readFileSync(path, { encoding: "utf-8" });
      return JSON.parse(text) as Type;
    } catch (error) {}
  }
}

export function writeToCache<Type>(path: string, value: Type | undefined) {
  if (value) {
    const data = JSON.stringify(
      {
        "// WARNING": "This file contains sensitive information; do not share!",
        ...value,
      },
      null,
      2
    );

    ensureFileSync(path);
    writeFileSync(path, data, { encoding: "utf-8" });
  } else {
    removeSync(path);
  }
}
