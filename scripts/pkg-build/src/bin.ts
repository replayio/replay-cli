import { getPackages, type Package } from "@manypkg/get-packages";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import builtInModules from "builtin-modules";
import chalk from "chalk";
import fastGlob from "fast-glob";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { rollup } from "rollup";
import { makePackagePredicate } from "./makePackagePredicate";
import { esbuild } from "./plugins/esbuild";
import { resolveErrors } from "./plugins/resolveErrors";
import { typescriptDeclarations } from "./plugins/typescriptDeclarations";

const statusFailed = chalk.redBright;
const statusSuccess = chalk.greenBright;

async function buildPkg(pkg: Package, packagesByName: Map<string, Package>) {
  const packageJson = pkg.packageJson;

  const isExternal = makePackagePredicate([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...builtInModules,
    ...builtInModules.map(m => `node:${m}`),
  ]);

  // TODO: filter to packages within packages directory
  const bundledDependencies = Object.keys(pkg.packageJson.devDependencies || {}).filter(name =>
    packagesByName.has(name)
  );
  const isBundledDependency = makePackagePredicate(bundledDependencies);
  const bundledDependenciesDirs = bundledDependencies.map(
    pkgName => [...packagesByName.values()].find(p => p.packageJson.name === pkgName)!.dir
  );
  const bundledRoot = `${pkg.dir}/src/_bundled`;

  const input = (
    "@replay-cli/pkg-build" in packageJson &&
    !!packageJson["@replay-cli/pkg-build"] &&
    typeof packageJson["@replay-cli/pkg-build"] === "object" &&
    "entrypoints" in packageJson["@replay-cli/pkg-build"] &&
    Array.isArray(packageJson["@replay-cli/pkg-build"].entrypoints)
      ? await fastGlob(packageJson["@replay-cli/pkg-build"].entrypoints, {
          cwd: pkg.dir,
          onlyFiles: true,
          absolute: true,
        })
      : [`${pkg.dir}/src/index.ts`]
  ).filter(input => !/\.(test|spec)\./i.test(input));

  const bundledIdsCache = new Map<string, string>();

  const bundle = await rollup({
    input,
    plugins: [
      resolveErrors({
        bundledDependenciesDirs,
        isBundledDependency,
        isExternal,
        pkg,
        bundledIdsCache,
      }),
      json(),
      {
        name: "bundled",
        async load(id) {
          if (id.includes("_bundled")) {
            let bundledId = id.replace(/^(.)+\/_bundled\//, "");
            let entrypointStart = bundledId.indexOf("/");
            if (entrypointStart !== -1 && bundledId.startsWith("@")) {
              entrypointStart = bundledId.indexOf("/", entrypointStart + 1);
            }
            let originalId;
            let sourceId;
            if (entrypointStart !== -1) {
              const pkgId = bundledId.slice(0, entrypointStart);
              const entrypoint = bundledId.slice(entrypointStart);
              originalId = `${pkgId}${entrypoint}`;
              sourceId = `${packagesByName.get(pkgId)!.dir}/src${entrypoint}`;
            } else {
              originalId = bundledId;
              sourceId = `${packagesByName.get(bundledId)!.dir}/src/index`;
            }

            bundledIdsCache.set(id, sourceId);

            // TODO: handle nested bundled dependencies
            const resolved = await this.resolve(sourceId, id);
            if (!resolved) {
              throw new Error(
                "Could not resolve bundled dependency source file for: " + originalId
              );
            }
            return fs.readFile(resolved.id, "utf8");
          }
          if (!/\.(mts|cts|ts|tsx)$/.test(id) || !bundledDependencies.length) {
            return null;
          }
          let code = await fs.readFile(id, "utf8");
          // TODO: handle dynamic imports
          code = code.replace(
            /((?:import|export)\s+(?:{[\w\s,]*}\s+from\s+)?)["'](.+)["']/g,
            (match, statementSlice, importedId) => {
              if (!isBundledDependency(importedId)) {
                return match;
              }
              let bundledPath = path.relative(path.dirname(id), `${bundledRoot}/${importedId}`);
              if (!bundledPath.startsWith(".")) {
                bundledPath = `./${bundledPath}`;
              }
              return statementSlice + `"${bundledPath}"`;
            }
          );
          return code;
        },
        async resolveId(id, importer, options) {
          if (!id.includes("_bundled")) {
            return null;
          }
          return id;
        },
      },
      nodeResolve({
        extensions: [".tsx", ".ts", ".js"],
      }),
      esbuild(),
      typescriptDeclarations(pkg, {
        cwd,
        entrypoints: input,
      }),
    ],
    external: isExternal,
    onLog: (level, log, defaultHandler) => {
      if (log.code === "EMPTY_BUNDLE") {
        return;
      }
      defaultHandler(level, log);
    },
  });

  await bundle.write({
    dir: `${pkg.dir}/dist`,
    format: "cjs",
    exports: "named",
    preserveModules: true,
    preserveModulesRoot: `${pkg.dir}/src`,
  });
}

async function build() {
  const cwd = process.cwd();
  const { packages } = await getPackages(cwd);

  const pkg = packages.find(pkg => pkg.dir === cwd);
  assert(pkg, `Could not find monorepo package at current directory: ${cwd}`);

  const packagesByName = new Map(packages.map(pkg => [pkg.packageJson.name, pkg]));

  try {
    await buildPkg(pkg, packagesByName);
    console.log(`${statusSuccess("✔")} Built successfully`);
  } catch (e) {
    console.error(`${statusFailed("✘")} Failed to build:\n`, e);
    process.exit(1);
  }
}

build();
