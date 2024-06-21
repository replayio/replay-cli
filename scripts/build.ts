import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import builtInModules from "builtin-modules";
import { rollup } from "rollup";
import { spawnSync } from "child_process";
import { getPackages } from "@manypkg/get-packages";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import normalizePath from "normalize-path";
import * as esbuild from "esbuild";
import fastGlob from "fast-glob";

const rootDir = path.join(__dirname, "..");
const tscPath = spawnSync("yarn", ["bin", "tsc"]).stdout.toString().trim();

async function rm(path: string) {
  try {
    await fs.rm(path, { recursive: true });
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

function makeExternalPredicate(externalArr: string[]) {
  // this makes sure nested imports of external packages are external
  const pattern = new RegExp(`^(${[...externalArr, ...builtInModules].join("|")})($|/)`);
  return (id: string) => pattern.test(id) || id.startsWith("node:");
}

async function build() {
  const { packages } = await getPackages(rootDir);
  const allPackageNames = new Set(packages.map(pkg => pkg.packageJson.name));

  await Promise.all(
    packages.flatMap(async pkg => [rm(`${pkg.dir}/dist`), rm(`${pkg.dir}/tsconfig.tsbuildinfo`)])
  );

  // generate typescript declaration files
  const tscResult = spawnSync(tscPath, ["-b"], { stdio: "inherit" });

  if (tscResult.status !== 0) {
    process.exit(1);
  }

  // now let's overwrite the generated dist files

  const results = await Promise.all(
    packages
      .filter(pkg => !pkg.packageJson.private && fsSync.existsSync(`${pkg.dir}/tsconfig.json`))
      .map(async pkg => {
        const packageJson = pkg.packageJson;

        const bundledDependencies = new Set(
          Object.keys(pkg.packageJson.devDependencies || {}).filter(name =>
            allPackageNames.has(name)
          )
        );

        const input =
          "@replayio/pkg-build" in packageJson &&
          !!packageJson["@replayio/pkg-build"] &&
          typeof packageJson["@replayio/pkg-build"] === "object" &&
          "entrypoints" in packageJson["@replayio/pkg-build"] &&
          Array.isArray(packageJson["@replayio/pkg-build"].entrypoints)
            ? await fastGlob(packageJson["@replayio/pkg-build"].entrypoints, {
                cwd: pkg.dir,
                onlyFiles: true,
                absolute: true,
              })
            : `${pkg.dir}/src/index.ts`;

        try {
          const bundle = await rollup({
            input,
            plugins: [
              {
                name: "resolve-errors",
                // based on https://github.com/preconstruct/preconstruct/blob/5113f84397990ff1381b644da9f6bb2410064cf8/packages/cli/src/rollup-plugins/resolve.ts
                async resolveId(source, importer) {
                  let resolved = await this.resolve(source, importer, {
                    skipSelf: true,
                  });
                  if (resolved === null) {
                    if (!source.startsWith(".")) {
                      throw new Error(
                        `"${source}" is imported ${
                          importer
                            ? `by "${normalizePath(path.relative(pkg.relativeDir, importer))}" `
                            : ""
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

                  if (resolved.id.startsWith(pkg.dir)) {
                    return resolved;
                  }

                  throw new Error(
                    `all relative imports in a package should only import modules inside of their package directory but ${
                      importer
                        ? `"${normalizePath(path.relative(pkg.relativeDir, importer))}"`
                        : "a module"
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
            external: makeExternalPredicate([
              ...Object.keys(packageJson.dependencies || {}),
              ...Object.keys(packageJson.peerDependencies || {}),
            ]),
          });

          await bundle.write({
            dir: `${pkg.dir}/dist`,
            format: "cjs",
            exports: "named",
            preserveModules: true,
          });
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
      })
  );

  const errors = results.filter(r => r.status === "rejected");
  if (errors.length > 0) {
    for (const { pkg, reason } of errors) {
      console.error(`[${pkg}]`, reason);
    }
    process.exit(1);
  }
}

build();
