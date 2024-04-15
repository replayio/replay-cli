const { existsSync } = require("fs");
if (existsSync("dist")) {
  require("child_process").spawnSync(
    `"${process.env.npm_node_execpath}"`,
    ["./bin.js", "first-run"],
    {
      shell: true,
      stdio: "inherit",
    }
  );
}
