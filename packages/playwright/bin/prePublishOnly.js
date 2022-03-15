if (!require("fs").existsSync("./index.js")) {
  console.error(
    "\x1b[31mError:\x1b[37m Wrong Directory. Publish from the dist/ directory instead\n"
  );
  process.exit(1);
}

process.exit(0);
