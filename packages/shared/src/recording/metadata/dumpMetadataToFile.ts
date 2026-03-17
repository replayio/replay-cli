import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { logDebug } from "../../logger";

export function dumpMetadataToFile(label: string, data: Record<string, unknown>) {
  try {
    const filePath = join(tmpdir(), `replay-metadata-${Date.now()}.txt`);
    const content = inspect(data, { depth: null, maxStringLength: null });
    writeFileSync(filePath, content);
    logDebug(`${label}: metadata written to ${filePath}`);
  } catch {
    // If even the dump fails, don't mask the original error
  }
}
