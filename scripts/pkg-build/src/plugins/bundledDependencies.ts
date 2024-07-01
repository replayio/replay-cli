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
  // TODO: handle dynamic imports
  return code.replace(
    /((?:import|export)\s+(?:{[\w\s,]*}\s+from\s+)?)["'](.+)["']/g,
    (match, statementSlice, importedId) => {
      if (!isBundledDependency(importedId)) {
        return match;
      }
      let bundledPath = path.relative(path.dirname(fileName), `${bundledRootDir}/${importedId}`);
      if (!bundledPath.startsWith(".")) {
        bundledPath = `./${bundledPath}`;
      }
      return statementSlice + `"${bundledPath}"`;
    }
  );
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
      if (!id.includes("_bundled")) {
        return null;
      }
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
        bundledSrcPath = `${packagesByName.get(bundledPkgId)!.dir}/src`;
        sourceId = `${bundledSrcPath}${entrypoint}`;
      } else {
        bundledPkgId = bundledId;
        bundledSrcPath = `${packagesByName.get(bundledId)!.dir}/src`;
        sourceId = `${bundledSrcPath}/index`;
      }

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
