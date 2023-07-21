const fs = require("fs");
const path = require("path");

const baseDir = require("../../packages/replay/dist/src/utils").getDirectory();
const dir = path.join(baseDir, "runtimes");

if (fs.existsSync(dir)) {
  console.log(`\nInstalled runtimes in ${dir}`);
  console.log(
    fs
      .readdirSync(dir)
      .filter(f => f !== "profiles")
      .map(d => `  ${d}`)
      .join("\n")
  );
} else {
  console.error(dir, "does not exist");
  exit(1);
}

const plugin = require("../../packages/cypress/dist").default;
const config = plugin(() => {}, { env: {} });

if (config && !(config instanceof Promise)) {
  console.log("\nCypress browsers");
  console.log(config.browsers?.map(b => `  ${b.name}: ${b.path}`).join("\n"));
} else {
  exit(1);
}
