import type { Package } from "@manypkg/get-packages";
import { graphSequencer } from "@pnpm/deps.graph-sequencer";
import fs from "node:fs";

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

export function getBuildablePackageGroups(packages: Package[]) {
  return sortPackages(
    packages.filter(
      pkg =>
        pkg.relativeDir.startsWith("packages/") &&
        !/\/examples?($|\/)/.test(pkg.relativeDir) &&
        fs.existsSync(`${pkg.dir}/tsconfig.json`)
    )
  );
}
