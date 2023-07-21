const fs = require("fs");
const path = require("path");

const baseDir = require("../../packages/replay/dist/src/utils").getDirectory();
const dir = path.join(baseDir, "runtimes");

if (fs.existsSync(dir)) {
  console.log(dir);
  console.log(
    fs
      .readdirSync(dir)
      .map(d => `  ${d}`)
      .join("\n")
  );
} else {
  console.error(dir, "does not exist");
  exit(1);
}
