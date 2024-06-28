import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { dim } from "@replay-cli/shared/theme";
import { uploadSourceMaps as uploadSourceMapsExternal } from "@replayio/sourcemap-upload";
import { replayApiServer } from "../config";
import { logPromise } from "../utils/async/logPromise";
import { registerCommand } from "../utils/commander/registerCommand";

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
  const { accessToken } = await getAccessToken();
  const uploadPromise = uploadSourceMapsExternal({
    extensions,
    filepaths: filePaths,
    group,
    ignore,
    key: accessToken,
    root,
    server: replayApiServer,
  });

  await logPromise(uploadPromise, {
    messages: {
      pending: "Uploading source maps...",
      success: "Source maps uploaded",
      failed: error => `Source maps upload failed:\n${error}`,
    },
  });

  await exitProcess(0);
}
