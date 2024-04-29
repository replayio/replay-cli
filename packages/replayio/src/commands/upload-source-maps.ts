import { uploadSourceMaps as uploadSourceMapsExternal } from "@replayio/sourcemap-upload";
import { replayApiServer } from "../config.js";
import { getAccessToken } from "../utils/authentication/getAccessToken.js";
import { registerCommand } from "../utils/commander/registerCommand.js";
import { exitProcess } from "../utils/exitProcess.js";
import { dim } from "../utils/theme.js";
import { logPromise } from "../utils/async/logPromise.js";

registerCommand("upload-source-maps <paths...>", { requireAuthentication: true })
  .description("Upload source-maps for a Workspace")
  .requiredOption(
    "-g, --group <name>",
    "The name to group this source map into, e.g. A commit SHA or release version."
  )
  .option(
    "-x, --extensions <exts>",
    `A comma-separated list of file extensions to process; ${dim('default ".js,.map"')}`,
    (value: string) => value.split(",")
  )
  .option(
    "-i, --ignore <pattern>",
    "Ignore files that match this pattern",
    (value: string, previous: Array<string> = []) => {
      return previous.concat([value]);
    }
  )
  .option("--root <dirname>", "The base directory to use when computing relative paths")
  .action(uploadSourceMaps);

async function uploadSourceMaps(
  filePaths: string[],
  {
    extensions,
    group,
    ignore,
    root,
  }: {
    extensions?: string[];
    group: string;
    ignore?: string[];
    root?: string;
  }
) {
  const uploadPromise = uploadSourceMapsExternal({
    extensions,
    filepaths: filePaths,
    group,
    ignore,
    key: await getAccessToken(),
    root,
    server: replayApiServer,
  });

  await logPromise(uploadPromise, {
    messages: {
      pending: "Uploading source maps...",
      success: "Source maps uploaded",
      failed: (error: any) => `Source maps upload failed:\n${error}`,
    },
  });

  await exitProcess(0);
}
