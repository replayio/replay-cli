import { getPackages, type Package } from "@manypkg/get-packages";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import builtInModules from "builtin-modules";
import chalk from "chalk";
import fastGlob from "fast-glob";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import { makePackagePredicate, PackagePredicate } from "./makePackagePredicate";
import { esbuild } from "./plugins/esbuild";
import { resolveErrors } from "./plugins/resolveErrors";

const statusFailed = chalk.redBright;
const statusSuccess = chalk.greenBright;

const tscPathResult = spawnSync("yarn", ["bin", "tsc"]);
if (tscPathResult.status !== 0) {
  throw new Error("Failed to find tsc");
}
const tscPath = tscPathResult.stdout.toString().trim();

async function buildJs(
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
      resolveErrors({
        bundledDependenciesDirs,
        isBundledDependency,
        isExternal,
        pkg,
      }),
      json(),
      nodeResolve({
        extensions: [".ts"],
      }),
      // in practice this only targets bundled dependencies as everything gets built as CJS
      commonjs(),
      esbuild(),
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

// effectively this overwrites input dts files with the output dts files
// some leftovers are possible as there is no guarantee that that they must map 1 to 1
// (output could be smaller)
// this is fine but it might leave somebody confused at times
//
// a better solution to all of this could be to hook up into the other Rollup task and its `generateBundle` hook
// in there a custom TS program could be created with createProgram. If the input could be transformed to swap the bundled import sources
// to relative paths then TS could just do its job and emit things as usual. Alternatively, we could allow references to bundled import to be generated
// and then we could rewrite them to relative paths that we'd copy-over from bundled dependencies
//
// the current solution here is superior in a sense that it tries to treeshake the output but that's not really necessary
// the first proposed solution would be more robust because dependencies between files within bundled dependencies would be naturally discovered and handled correctly.
//
// note that we wouldn't hve to literally copy-over the files from bundled dependencies, we could resolve them using a virtual file system host
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
        extensions: [".d.ts"],
      }),
      dts({
        respectExternal: true,
        tsconfig: `${pkg.dir}/tsconfig.json`,
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
    preserveModulesRoot: `${pkg.dir}/dist`,
    sanitizeFileName: fileName => {
      // we are working on declaration file inputs here
      // so we need to drop the extra `.d` "extension" from the file name
      // to work nicely with `chunkFileNames` and `entryFileNames`
      // https://github.com/Swatinem/rollup-plugin-dts/blob/26e96d6c29a0e7c14c4a5be27fd774b989229649/src/transform/index.ts#L62-L63
      return fileName.replace(/\.d$/, "");
    },
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

  const options = { bundledDependenciesDirs, input, isBundledDependency, isExternal };
  // TODO: parallelize this better
  const tscResult = spawnSync(tscPath, [], { stdio: "inherit" });
  if (tscResult.status !== 0) {
    throw new Error("tsc failed");
  }
  await buildJs(pkg, options);
  await buildDts(pkg, {
    ...options,
    input: input.map(f => f.replace("/src/", "/dist/").replace(/\.ts$/, ".d.ts")),
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
