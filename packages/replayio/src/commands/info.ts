import { name as packageName, version as packageVersion } from "../package.js";
import { registerCommand } from "../utils/commander/registerCommand.js";
import { exitProcess } from "../utils/exitProcess.js";
import { getCurrentRuntimeMetadata } from "../utils/initialization/getCurrentRuntimeMetadata.js";
import { parseBuildId } from "../utils/installation/parseBuildId.js";
import { highlight } from "../utils/theme.js";

registerCommand("info").description("Display info for installed Replay dependencies").action(info);

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
  }

  await exitProcess(0);
}
