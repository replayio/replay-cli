import { Package } from "@manypkg/get-packages";
import fs from "node:fs/promises";
import path from "node:path";
import { Plugin } from "rollup";
import { PackagePredicate } from "../makePackagePredicate";

export function transformImportSources(
  code: string,
  {
    bundledRootDir,
    fileName,
    isBundledDependency,
  }: {
    bundledRootDir: string;
    fileName: string;
    isBundledDependency: PackagePredicate;
  }
) {
  return code.replace(
    // this regex matches:
    //
    // import "shared"
    // import("shared")
    // from "shared"
    //
    // it doesn't always check if the import is even at the valid position
    // this should be good enough though, it's unlikely to match false positives
    //
    // note that it's important that we handle here cases like:
    //
    // import def from "shared"
    // import * ns from "shared"
    // import def, { named } from "shared"
    // import { named } from "shared"
    // export { named } from "shared"
    /((?:import\s*\(\s*|import\s+|(?:\s|})from\s+))["'](.+)["']/g,
    (match, preceedingSlice, importedId) => {
      if (!isBundledDependency(importedId)) {
        return match;
      }
      let bundledPath = path.relative(path.dirname(fileName), `${bundledRootDir}/${importedId}`);
      if (!bundledPath.startsWith(".")) {
        bundledPath = `./${bundledPath}`;
      }
      return preceedingSlice + `"${bundledPath}"`;
    }
  );
}

// TODO: unify this with getPotentialBundledSourceId
function getBundledDependencyDescriptor(
  path: string,
  { packagesByName }: { packagesByName: Map<string, Package> }
) {
  let bundledId = path.replace(/^(.)+\/_bundled\//, "");
  let entrypointStart = bundledId.indexOf("/");
  if (entrypointStart !== -1 && bundledId.startsWith("@")) {
    entrypointStart = bundledId.indexOf("/", entrypointStart + 1);
  }
  if (entrypointStart !== -1) {
    const pkgName = bundledId.slice(0, entrypointStart);
    if (!packagesByName.has(pkgName)) {
      // TS can "probe" various locations that don't exist
      return;
    }
    return {
      pkgName,
      entrypoint: bundledId.slice(entrypointStart),
    };
  } else {
    if (!packagesByName.has(bundledId)) {
      // TS can "probe" various locations that don't exist
      return;
    }
    return {
      pkgName: bundledId,
      entrypoint: null,
    };
  }
}

// TODO: rename/refactor this
export function getPotentialBundledSourceId(
  id: string,
  { packagesByName }: { packagesByName: Map<string, Package> }
) {
  let bundledId = id.replace(/^(.)+\/_bundled\//, "");
  let entrypointStart = bundledId.indexOf("/");
  if (entrypointStart !== -1 && bundledId.startsWith("@")) {
    entrypointStart = bundledId.indexOf("/", entrypointStart + 1);
  }
  let bundledPkgId;
  let bundledSrcPath;
  let sourceId;

  if (entrypointStart !== -1) {
    const entrypoint = bundledId.slice(entrypointStart);
    bundledPkgId = bundledId.slice(0, entrypointStart);
    const pkg = packagesByName.get(bundledPkgId);
    if (!pkg) {
      // TS can "probe" various locations that don't exist
      return;
    }
    bundledSrcPath = `${pkg.dir}/src`;
    sourceId = `${bundledSrcPath}${entrypoint}`;
  } else {
    bundledPkgId = bundledId;
    const pkg = packagesByName.get(bundledId);
    if (!pkg) {
      // TS can "probe" various locations that don't exist
      return;
    }
    bundledSrcPath = `${pkg.dir}/src`;
    sourceId = `${bundledSrcPath}/index`;
  }

  return { bundledPkgId, bundledSrcPath, sourceId };
}

export function bundledDependencies({
  fsMap,
  isBundledDependency,
  packagesByName,
  resolvedBundledIds,
  rootDir,
}: {
  fsMap: Map<string, string>;
  isBundledDependency: PackagePredicate;
  packagesByName: Map<string, Package>;
  resolvedBundledIds: Map<string, string>;
  rootDir: string;
}): Plugin {
  const bundledRootDir = `${rootDir}/_bundled`;

  return {
    name: "bundled-dependencies",
    async load(id) {
      if (!/\.(mts|cts|ts|tsx)$/.test(id)) {
        return null;
      }

      const code = transformImportSources(
        await fs.readFile(resolvedBundledIds.get(id) ?? id, "utf8"),
        {
          bundledRootDir,
          fileName: id,
          isBundledDependency,
        }
      );

      fsMap.set(id, code);

      return code;
    },
    async resolveId(id, importer, options) {
      const isRelativeImportInBundled = id.startsWith(".") && importer?.includes("_bundled");
      if (isRelativeImportInBundled) {
        const absoluteId = path.join(path.dirname(importer!), id);
        const importerPkgName = getBundledDependencyDescriptor(importer!, {
          packagesByName,
        })?.pkgName;
        const importeePkgName = getBundledDependencyDescriptor(absoluteId, {
          packagesByName,
        })?.pkgName;
        if (!importerPkgName || !importeePkgName) {
          throw new Error(
            `Could not find importer's or importee's package name. This should not happen in this part of the build process`
          );
        }
        if (importerPkgName === importeePkgName) {
          const importerSourceId = resolvedBundledIds.get(importer!);
          if (!importerSourceId) {
            throw new Error(`Could not find original source id for ${importer}`);
          }
          const resolved = await this.resolve(id, importerSourceId, {
            ...options,
            custom: {
              ...options.custom,
              "bundled-dependencies": true,
            },
          });

          if (!resolved) {
            throw new Error(`Could not resolve ${id} from ${importerSourceId}`);
          }

          const relativeInSource = path.relative(path.dirname(importerSourceId), resolved.id);
          const bundledLocalId = path.join(path.dirname(importer!), relativeInSource);

          resolvedBundledIds.set(bundledLocalId, resolved.id);

          return bundledLocalId;
        }
        id = absoluteId;
      }

      if (!id.includes("_bundled")) {
        return null;
      }

      const potentialBundledSourceIdResult = getPotentialBundledSourceId(id, {
        packagesByName,
      });

      if (!potentialBundledSourceIdResult) {
        throw new Error("This should never happen.");
      }

      const { bundledPkgId, bundledSrcPath, sourceId } = potentialBundledSourceIdResult;
      const resolved = await this.resolve(sourceId, undefined, {
        ...options,
        custom: {
          ...options.custom,
          "bundled-dependencies": true,
        },
      });

      if (!resolved) {
        throw new Error(`Could not resolve ${sourceId}`);
      }

      const bundledLocalId = `${bundledRootDir}/${bundledPkgId}${resolved.id.replace(
        bundledSrcPath,
        ""
      )}`;

      resolvedBundledIds.set(bundledLocalId, resolved.id);

      return bundledLocalId;
    },
  };
}
