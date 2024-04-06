import { registerAuthenticatedCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { dim } from "../utils/theme";

registerAuthenticatedCommand("upload-source-maps <paths...>")
  .description("Upload source-maps for a Workspace")
  .requiredOption(
    "-g, --group <name>",
    "The name to group this sourcemap into, e.g. A commit SHA or release version."
  )
  .option("    --api-key <key>", "Authentication API Key")
  .option(
    "    --batch-size <batchSize>",
    `Number of sourcemaps to upload in parallel; ${dim("max 25")}`
  )
  .option("    --dry-run", "Perform all of the usual CLI logic, but the final sourcemap upload.")
  .option(
    "-x, --extensions <exts>",
    `A comma-separated list of extensions to process; ${dim('default ".js,.map"')}`,
    (value: string) => value.split(",")
  )
  .option(
    "-i, --ignore <pattern>",
    "Ignore files that match this pattern",
    (value: string, previous: Array<string> = []) => {
      return previous.concat([value]);
    }
  )
  .option("    --root <dirname>", "The base directory to use when computing relative paths")
  .option("-q, --quiet", "Silence all stdout logging.")
  .option("-v, --verbose", "Output extra data to stdout when processing files.")
  .action(uploadSourceMaps);

async function uploadSourceMaps() {
  // TODO [PRO-*] Implement source-map upload

  await exitProcess(0);
}
