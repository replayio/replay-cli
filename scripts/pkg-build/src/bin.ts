import { getPackages, type Package } from "@manypkg/get-packages";
import { graphSequencer } from "@pnpm/deps.graph-sequencer";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import builtInModules from "builtin-modules";
import * as esbuild from "esbuild";
import fastGlob from "fast-glob";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import normalizePath from "normalize-path";
import { rollup, RollupOptions } from "rollup";
import { dts } from "rollup-plugin-dts";

async function rm(path: string) {
  try {
    await fs.rm(path, { recursive: true });
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

type PackagePredicate = (id: string) => boolean;

function makePackagePredicate(names: string[]): PackagePredicate {
  if (names.length === 0) {
    return () => false;
  }
  // this makes sure nested imports of external packages are external
  const pattern = new RegExp(`^(${names.join("|")})($|/)`);
  return (id: string) => pattern.test(id);
}

// based on https://github.com/pnpm/pnpm/blob/6e031e7428b3e46fc093f47a5702ac8510703a91/workspace/sort-packages/src/index.ts
function sortPackages(packages: Package[]) {
  const keys = packages.map(pkg => pkg.packageJson.name);
  const setOfKeys = new Set(keys);
  const graph = new Map(
    packages.map(
      pkg =>
        [
          pkg.packageJson.name,
          [
            ...Object.keys(pkg.packageJson.dependencies || {}),
            ...Object.keys(pkg.packageJson.devDependencies || {}),
            ...Object.keys(pkg.packageJson.peerDependencies || {}),
          ].filter(d => d !== pkg.packageJson.name && setOfKeys.has(d)),
        ] as const
    )
  );
  const sequenced = graphSequencer(graph, keys);
  if (sequenced.cycles.length) {
    throw new Error(
      `Cycles detected in the package graph: ${sequenced.cycles
        .map(cycle => cycle.join(" -> "))
        .join(", ")}`
    );
  }
  return sequenced.chunks;
}

async function buildRuntime(
  pkg: Package,
  {
    bundledDependenciesDirs,
    input,
    isBundledDependency,
    isExternal,
  }: {
    bundledDependenciesDirs: string[];
    input: string[];
    isBundledDependency: PackagePredicate;
    isExternal: PackagePredicate;
  }
) {
  const bundle = await rollup({
    input,
    plugins: [
      {
        name: "resolve-errors",
        // based on https://github.com/preconstruct/preconstruct/blob/5113f84397990ff1381b644da9f6bb2410064cf8/packages/cli/src/rollup-plugins/resolve.ts
        async resolveId(source, importer) {
          if (source.startsWith("\0") || isBundledDependency(source)) {
            return;
          }
          if (!source.startsWith(".") && !source.startsWith("/") && !isExternal(source)) {
            throw new Error(
              `"${source}" is imported ${
                importer ? `by "${normalizePath(path.relative(pkg.relativeDir, importer))}" ` : ""
              }but the package is not specified in dependencies or peerDependencies`
            );
          }
          let resolved = await this.resolve(source, importer, {
            skipSelf: true,
          });
          if (resolved === null) {
            if (!source.startsWith(".")) {
              throw new Error(
                `"${source}" is imported ${
                  importer ? `by "${normalizePath(path.relative(pkg.relativeDir, importer))}" ` : ""
                }but the package is not specified in dependencies or peerDependencies`
              );
            }
            throw new Error(
              `Could not resolve ${source} ` +
                (importer ? `from ${path.relative(pkg.relativeDir, importer)}` : "")
            );
          }

          if (source.startsWith("\0") || resolved.id.startsWith("\0")) {
            return resolved;
          }

          if (
            resolved.id.startsWith(pkg.dir) ||
            bundledDependenciesDirs.some(dir => resolved.id.startsWith(dir))
          ) {
            return resolved;
          }

          throw new Error(
            `all relative imports in a package should only import modules inside of their package directory but ${
              importer ? `"${normalizePath(path.relative(pkg.relativeDir, importer))}"` : "a module"
            } is importing "${source}"`
          );
        },
      },
      json(),
      nodeResolve({
        extensions: [".ts"],
      }),
      {
        name: "esbuild",
        async transform(code, id) {
          if (!/\.(mts|cts|ts|tsx)$/.test(id)) {
            return null;
          }
          const result = await esbuild.transform(code, {
            loader: "ts",
          });
          return result.code;
        },
      },
    ],
    external: isExternal,
  });

  await bundle.write({
    dir: `${pkg.dir}/dist`,
    format: "cjs",
    exports: "named",
    preserveModules: true,
    preserveModulesRoot: `${pkg.dir}/src`,
  });
}

async function buildDts(
  pkg: Package,
  {
    input,
    isExternal,
  }: {
    input: string[];
    isExternal: PackagePredicate;
  }
) {
  const bundle = await rollup({
    input,
    plugins: [
      json(),
      nodeResolve({
        extensions: [".ts"],
      }),
      dts({
        respectExternal: true,
        tsconfig: `${pkg.dir}/tsconfig.json`,
      }),
    ],
    external: isExternal,
  });

  await bundle.write({
    dir: `${pkg.dir}/dist`,
    format: "cjs",
    exports: "named",
    preserveModules: true,
    preserveModulesRoot: `${pkg.dir}/src`,
  });
}

async function buildPkg(pkg: Package, packagesByName: Map<string, Package>) {
  const packageJson = pkg.packageJson;

  const isExternal = makePackagePredicate([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...builtInModules,
    ...builtInModules.map(m => `node:${m}`),
  ]);

  const bundledDependencies = Object.keys(pkg.packageJson.devDependencies || {}).filter(name =>
    packagesByName.has(name)
  );
  const isBundledDependency = makePackagePredicate(bundledDependencies);
  const bundledDependenciesDirs = bundledDependencies.map(
    pkgName => [...packagesByName.values()].find(p => p.packageJson.name === pkgName)!.dir
  );

  const input =
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
      : [`${pkg.dir}/src/index.ts`];

  try {
    const options = { bundledDependenciesDirs, input, isBundledDependency, isExternal };
    await Promise.all([buildRuntime(pkg, options), buildDts(pkg, options)]);
    return {
      status: "fulfilled" as const,
      pkg: packageJson.name,
    };
  } catch (error) {
    return {
      status: "rejected" as const,
      reason: error,
      pkg: packageJson.name,
    };
  }
}

async function buildAll() {
  const { packages } = await getPackages(process.cwd());
  const packagesByName = new Map(packages.map(pkg => [pkg.packageJson.name, pkg]));

  await Promise.all(packages.flatMap(pkg => rm(`${pkg.dir}/dist`)));

  const sortedPackageGroups = sortPackages(
    packages.filter(
      pkg => !pkg.packageJson.private && fsSync.existsSync(`${pkg.dir}/tsconfig.json`)
    )
  );

  const results: Awaited<ReturnType<typeof buildPkg>>[] = [];

  console.log(JSON.stringify(sortedPackageGroups, null, 2));
  for (const group of sortedPackageGroups) {
    const packages = group.map(name => packagesByName.get(name)!);
    results.push(...(await Promise.all(packages.map(pkg => buildPkg(pkg, packagesByName)))));

    if (packages.find(a => a.packageJson.name === "@replayio/replay")) {
      return;
    }
  }

  const errors = results.filter(r => r.status === "rejected");
  if (errors.length > 0) {
    for (const { pkg, reason } of errors) {
      console.error(`[${pkg}]`, reason);
    }
    process.exit(1);
  }
}

buildAll();
