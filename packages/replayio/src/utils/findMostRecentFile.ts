import { readdir, stat } from "fs-extra";
import { join } from "path";

export async function findMostRecentFile(
  directory: string,
  predicate: (fileName: string) => boolean = () => true
) {
  let mostRecent = undefined as string | undefined;
  let mostRecentMtimeMs = 0;

  await Promise.all(
    (
      await readdir(directory)
    ).map(async fileName => {
      const filePath = join(directory, fileName);
      let stats;

      try {
        stats = await stat(filePath);
      } catch {
        return;
      }

      if (
        !stats.isFile() ||
        !predicate(fileName) ||
        (mostRecent && stats.mtimeMs < mostRecentMtimeMs)
      ) {
        return;
      }

      mostRecent = filePath;
      mostRecentMtimeMs = stats.mtimeMs;
    })
  );

  return mostRecent;
}
