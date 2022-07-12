import { LogCallback, uploadSourceMaps } from "@replayio/sourcemap-upload";
import { program } from "commander";
import {
  listAllRecordings,
  uploadRecording,
  processRecording,
  uploadAllRecordings,
  viewRecording,
  viewLatestRecording,
  removeRecording,
  removeAllRecordings,
  updateBrowsers,
} from "./main";
import { CommandLineOptions, SourcemapUploadOptions } from "./types";

program
  .command("ls")
  .description("List information about all recordings.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandListAllRecordings);

program
  .command("upload <id>")
  .description("Upload a recording to the remote server.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .option('--include-in-progress', 'Upload all recordings, including ones with an in progress status')
  .action(commandUploadRecording);

program
  .command("process <id>")
  .description("Upload a recording to the remote server and process it.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandProcessRecording);

program
  .command("upload-all")
  .description("Upload all recordings to the remote server.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .option('--include-in-progress', 'Upload all recordings, including ones with an in progress status')
  .action(commandUploadAllRecordings);

program
  .command("view <id>")
  .description("Load the devtools on a recording, uploading it if needed.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandViewRecording);

program
  .command("view-latest")
  .description("Load the devtools on the latest recording, uploading it if needed.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandViewLatestRecording);

program
  .command("rm <id>")
  .description("Remove a specific recording.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandRemoveRecording);

program
  .command("rm-all")
  .description("Remove all recordings.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandRemoveAllRecordings);

program
  .command("update-browsers")
  .description("Update browsers used in automation.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandUpdateBrowsers);

program
  .command("upload-sourcemaps")
  .requiredOption(
    "-g, --group <name>",
    "The name to group this sourcemap into, e.g. A commit SHA or release version."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .option(
    "--dry-run",
    "Perform all of the usual CLI logic, but the final sourcemap upload."
  )
  .option(
    "-x, --extensions <exts>",
    "A comma-separated list of extensions to process. Defaults to '.js,.map'.",
    collectExtensions
  )
  .option(
    "-i, --ignore <pattern>",
    "Ignore files that match this pattern",
    collectIgnorePatterns
  )
  .option("-q, --quiet", "Silence all stdout logging.")
  .option("-v, --verbose", "Output extra data to stdout when processing files.")
  .option(
    "--root <dirname>",
    "The base directory to use when computing relative paths"
  )
  .arguments("<paths...>")
  .action((filepaths, opts) => commandUploadSourcemaps(filepaths, opts));

program
  .parseAsync()
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });

function collectExtensions(value: string) {
  return value.split(",");
}
function collectIgnorePatterns(value: string, previous: Array<string> = []) {
  return previous.concat([value]);
}

function commandListAllRecordings(opts: Pick<CommandLineOptions, "directory">) {
  const recordings = listAllRecordings({ ...opts, verbose: true });
  console.log(JSON.stringify(recordings, null, 2));
  process.exit(0);
}

async function commandUploadRecording(id: string, opts: CommandLineOptions) {
  const recordingId = await uploadRecording(id, { ...opts, verbose: true });
  process.exit(recordingId ? 0 : 1);
}

async function commandProcessRecording(id: string, opts: CommandLineOptions) {
  const recordingId = await processRecording(id, { ...opts, verbose: true });
  process.exit(recordingId ? 0 : 1);
}

async function commandUploadAllRecordings(opts: CommandLineOptions) {
  const uploadedAll = await uploadAllRecordings({ ...opts, verbose: true });
  process.exit(uploadedAll ? 0 : 1);
}

async function commandViewRecording(id: string, opts: CommandLineOptions) {
  const viewed = await viewRecording(id, { ...opts, verbose: true });
  process.exit(viewed ? 0 : 1);
}

async function commandViewLatestRecording(opts: CommandLineOptions) {
  const viewed = await viewLatestRecording({ ...opts, verbose: true });
  process.exit(viewed ? 0 : 1);
}

function commandRemoveRecording(id: string, opts: Pick<CommandLineOptions, "directory">) {
  const removed = removeRecording(id, { ...opts, verbose: true });
  process.exit(removed ? 0 : 1);
}

function commandRemoveAllRecordings(opts: Pick<CommandLineOptions, "directory">) {
  removeAllRecordings({ ...opts, verbose: true });
  process.exit(0);
}

async function commandUpdateBrowsers(opts: Pick<CommandLineOptions, "directory">) {
  await updateBrowsers({ ...opts, verbose: true });
  process.exit(0);
}

async function commandUploadSourcemaps(
  filepaths: Array<string>,
  cliOpts: SourcemapUploadOptions & Pick<CommandLineOptions, "apiKey">
): Promise<void> {
  const { quiet, verbose, apiKey, ...uploadOpts } = cliOpts;

  let log: LogCallback | undefined;
  if (!quiet) {
    if (verbose) {
      log = (_level, message) => {
        console.log(message);
      };
    } else {
      log = (level, message) => {
        if (level === "normal") {
          console.log(message);
        }
      };
    }
  }

  await uploadSourceMaps({
    filepaths,
    key: apiKey,
    ...uploadOpts,
    log,
  });
}
