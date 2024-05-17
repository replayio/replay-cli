const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");

const playwrightVersion = process.argv[2];

assert(playwrightVersion, "Playwright version is required");

(async () => {
  const pkgJsonPath = path.join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8"));
  await fs.writeFile(
    "package.json",
    JSON.stringify(
      {
        ...packageJson,
        resolutions: {
          ...packageJson.resolutions,
          // @playwright/test depends on fixed version of playwright and that depends on fixed version of playwright-core
          // so it should be enough to only enforce the version of @playwright/test here
          "@playwright/test": playwrightVersion,
        },
      },
      null,
      2
    ) + "\n"
  );
})();
