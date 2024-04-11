import { basename, sep } from "path";
import { isPackageManagerInstalled } from "./isPackageManagerInstalled";
import { PackageManager } from "./types";

export function getPackageManagerCommand(): PackageManager | undefined {
  // If this is a global install, it's possible we can detect the package manager that way
  const path = basename(__filename);
  if (path.includes("pnpm" + sep)) {
    return "pnpm";
  } else if (path.includes("yarn" + sep)) {
    return "yarn";
  }

  // Otherwise let's see which package manager(s) are installed
  if (isPackageManagerInstalled("pnpm")) {
    return "pnpm";
  } else if (isPackageManagerInstalled("yarn")) {
    return "yarn";
  } else if (isPackageManagerInstalled("npm")) {
    return "npm";
  }
}
