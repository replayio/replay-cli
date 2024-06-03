import { readdir, stat } from "fs-extra";
import { join } from "path";

export async function findMostRecentFile(
  directory: string,
  predicate: (fileName: string) => boolean = () => true
) {
  const fileNames = await readdir(directory);
  const candidates = await Promise.all(
    fileNames.map(async fileName => {
      const filePath = join(directory, fileName);
      const stats = await stat(filePath);
      if (!stats.isFile() || !predicate(fileName)) {
        return;
      }
      return {
        filePath,
        mtimeMs: stats.mtimeMs,
      };
    })
  );

  let mostRecent: (typeof candidates)[number] | undefined = undefined;

  for (const candidate of candidates) {
    if (!candidate || (mostRecent && candidate.mtimeMs < mostRecent.mtimeMs)) {
      continue;
    }
    mostRecent = candidate;
  }

  return mostRecent?.filePath;
}
