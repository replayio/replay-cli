import { uploadSourceMaps as uploadSourceMapsExternal } from "@replayio/sourcemap-upload";
import { replayApiServer } from "../config";
import { getAccessToken } from "../utils/authentication/getAccessToken";
import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";
import { dim } from "../utils/theme";
import { logPromise } from "../utils/async/logPromise";

registerCommand("upload-sourcemaps <paths...>", { requireAuthentication: true })
  .description("Upload source-maps for a Workspace")
  .requiredOption(
    "-g, --group <name>",
    "The name to group this sourcemap into, e.g. A commit SHA or release version."
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
  debugger;

  await logPromise(uploadPromise, {
    messages: {
      pending: "Uploading sourcemaps...",
      success: "Source maps uploaded",
      failed: error => `Source maps upload failed:\n${error}`,
    },
  });

  await exitProcess(0);
}
