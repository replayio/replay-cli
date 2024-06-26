const fs = require("fs/promises");
const path = require("path");

async function mirrorDistFiles(sourceDir, targetDir) {
  const sourceFiles = await fs.readdir(sourceDir);

  await Promise.all(
    sourceFiles.map(async filename => {
      const sourcePath = path.join(sourceDir, filename);
      const targetPath = path.join(targetDir, filename);

      if ((await fs.stat(sourcePath)).isDirectory()) {
        try {
          await fs.mkdir(targetPath);
        } catch (err) {
          if (err.code !== "EEXIST") {
            throw err;
          }
        }
        await mirrorDistFiles(sourcePath, targetPath);
        return;
      }
      if (!filename.endsWith(".js")) {
        return;
      }
      const relativeSourcePath = path.relative(path.dirname(targetPath), sourcePath);
      const hasDefaultExport = (
        await fs.readFile(sourcePath.replace(/\.js$/, ".d.ts"), "utf8")
      ).includes("export default");
      await Promise.all([
        fs.writeFile(targetPath, `module.exports = require("${relativeSourcePath}");\n`),
        fs.writeFile(
          targetPath.replace(/\.js$/, ".d.ts"),
          [
            `export * from "${relativeSourcePath}";`,
            hasDefaultExport && `export { default } from "${relativeSourcePath}";`,
          ]
            .filter(Boolean)
            .join("\n") + "\n"
        ),
      ]);
    })
  );
}

(async () => {
  const source = path.join(__dirname, "..", "dist", "metadata");
  const target = path.join(__dirname, "..", "metadata");

  try {
    await fs.mkdir(target);
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  await mirrorDistFiles(source, target);
})();
