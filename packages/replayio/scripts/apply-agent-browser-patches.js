"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findNodeModulesRoot(startDir) {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, "node_modules", "agent-browser", "package.json");
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function main() {
  const packageDir = path.resolve(__dirname, "..");
  const patchDir = path.join(packageDir, "patches");

  if (!fs.existsSync(patchDir)) {
    process.exit(0);
  }

  const nodeModulesRoot = findNodeModulesRoot(packageDir);
  if (!nodeModulesRoot) {
    // agent-browser may not be installed yet; skip silently.
    process.exit(0);
  }

  const patchPackageEntry = require.resolve("patch-package/dist/index.js");
  const patchDirArg = path.relative(nodeModulesRoot, patchDir);
  const result = spawnSync(
    process.execPath,
    [
      patchPackageEntry,
      "--patch-dir",
      patchDirArg,
      "--error-on-fail",
      "--silent",
    ],
    {
      cwd: nodeModulesRoot,
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) === 0) {
    ensureReplayBrowserShim(nodeModulesRoot);
  }

  process.exit(result.status ?? 0);
}

function ensureReplayBrowserShim(nodeModulesRoot) {
  const binDir = path.join(nodeModulesRoot, "node_modules", ".bin");
  const source = path.join(nodeModulesRoot, "node_modules", "agent-browser", "bin", "agent-browser.js");
  if (!fs.existsSync(source) || !fs.existsSync(binDir)) {
    return;
  }

  // Remove the original shim name to avoid ambiguity with globally-installed agent-browser.
  for (const stale of ["agent-browser", "agent-browser.cmd", "agent-browser.ps1"]) {
    const stalePath = path.join(binDir, stale);
    if (fs.existsSync(stalePath)) {
      fs.rmSync(stalePath, { force: true });
    }
  }

  const unixShimPath = path.join(binDir, "replay-browser");
  const unixShim = "#!/usr/bin/env node\nrequire('../agent-browser/bin/agent-browser.js');\n";
  fs.writeFileSync(unixShimPath, unixShim, "utf8");
  fs.chmodSync(unixShimPath, 0o755);

  const cmdShimPath = path.join(binDir, "replay-browser.cmd");
  const cmdShim = "@ECHO off\r\nnode \"%~dp0\\..\\agent-browser\\bin\\agent-browser.js\" %*\r\n";
  fs.writeFileSync(cmdShimPath, cmdShim, "utf8");
}

main();
