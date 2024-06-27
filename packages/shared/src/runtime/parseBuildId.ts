export function parseBuildId(buildId: string) {
  const [os, runtime, releaseDateString] = buildId.split("-");

  const releaseDate = new Date(
    parseInt(releaseDateString.slice(0, 4)),
    parseInt(releaseDateString.slice(4, 6)) - 1,
    parseInt(releaseDateString.slice(6, 8))
  );

  return { os, runtime, releaseDate };
}
