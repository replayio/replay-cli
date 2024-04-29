const { existsSync } = require("fs");
if (existsSync("dist")) {
  require("./dist/first-run.js");
}
