export type PackagePredicate = (id: string) => boolean;

export function makePackagePredicate(names: string[]): PackagePredicate {
  if (names.length === 0) {
    return () => false;
  }
  // this makes sure nested imports of external packages are external
  const pattern = new RegExp(`^(${names.join("|")})($|/)`);
  return (id: string) => pattern.test(id);
}
