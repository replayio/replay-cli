import { getPackages, type Package } from "@manypkg/get-packages";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import builtInModules from "builtin-modules";
import chalk from "chalk";
import fastGlob from "fast-glob";
import assert from "node:assert/strict";
import { rollup } from "rollup";
import { makePackagePredicate } from "./makePackagePredicate";
import { bundledDependencies } from "./plugins/bundledDependencies";
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
  const isBundledDependency = makePackagePredicate(
    Object.keys(pkg.packageJson.devDependencies || {}).filter(
      name => packagesByName.has(name) && !isExternal(name)
    )
  );

  const bundledIds = new Set<string>();
  const fsMap = new Map<string, string>();
  const resolvedBundledIds = new Map<string, string>();

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

  const rootDir = `${pkg.dir}/src`;

  const bundle = await rollup({
    input,
    plugins: [
      resolveErrors({
        bundledIds,
        isExternal,
        packagesByName,
        pkg,
      }),
      json(),
      bundledDependencies({
        bundledIds,
        fsMap,
        isBundledDependency,
        packagesByName,
        resolvedBundledIds,
        rootDir,
      }),
      nodeResolve({
        extensions: [".tsx", ".ts", ".js"],
      }),
      esbuild(),
      typescriptDeclarations(pkg, {
        cwd: pkg.dir,
        entrypoints: input,
        fsMap,
        isBundledDependency,
        packagesByName,
        resolvedBundledIds,
        rootDir,
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
