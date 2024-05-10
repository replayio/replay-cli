import { name as packageName, version as packageVersion } from "../../package.json";
import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";
import { getCurrentRuntimeMetadata } from "../utils/initialization/getCurrentRuntimeMetadata";
import { parseBuildId } from "../utils/installation/parseBuildId";
import { highlight } from "../utils/theme";

registerCommand("info", {
  checkForNpmUpdate: false,
  checkForRuntimeUpdate: false,
  requireAuthentication: false,
})
  .description("Display info for installed Replay dependencies")
  .action(info);

async function info() {
  console.log(`Currently using ${highlight(`${packageName}@${packageVersion}`)}`);

  const metadata = getCurrentRuntimeMetadata("chromium");
  if (metadata) {
    const { buildId, forkedVersion } = metadata;

    const { releaseDate } = parseBuildId(buildId);

    console.log("\nReplay Chromium");
    console.log(`• Release date: ${highlight(releaseDate.toLocaleDateString())}`);
    if (forkedVersion) {
      console.log(`• Forked version: ${highlight(forkedVersion)}`);
    }
    console.log(`• Build id: ${highlight(buildId)}`);
  }

  await exitProcess(0);
}
