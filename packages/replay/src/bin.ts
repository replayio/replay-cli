import { LogCallback, uploadSourceMaps } from "@replayio/sourcemap-upload";
import { program } from "commander";
import dbg from "debug";
import { formatAllRecordingsHumanReadable, formatAllRecordingsJson } from "./cli/formatRecordings";
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
  updateMetadata,
  launchBrowser,
} from "./main";
import {
  FilterOptions,
  MetadataOptions,
  Options,
  SourcemapUploadOptions,
  UploadOptions,
} from "./types";
import { assertValidBrowserName, fuzzyBrowserName } from "./utils";
import { maybeAuthenticateUser } from "./auth";

export interface CommandLineOptions extends Options {
  /**
   * JSON output
   */
  json?: boolean;

  /**
   * Warn of failures but do not quit with a non-zero exit code
   */
  warn?: boolean;
}

const debug = dbg("replay:cli");

// Create command with global options
function commandWithGlobalOptions(cmdString: string) {
  return program
    .command(cmdString)
    .option("--warn", "Terminate with a 0 exit code on error")
    .option("--directory <dir>", "Alternate recording directory")
    .option("--server <address>", "Alternate server to upload recordings to");
}

// TODO(dmiller): `--json` should probably be a global option that applies to all commands.
commandWithGlobalOptions("ls")
  .description("List information about all recordings.")
  .option("-a, --all", "Include all recordings")
  .option("--json", "Output in JSON format")
  .option("--filter <filter string>", "String to filter recordings")
  .action(commandListAllRecordings);

commandWithGlobalOptions("upload <id>")
  .description("Upload a recording to the remote server.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandUploadRecording);

commandWithGlobalOptions("launch [url]")
  .description("Launch the replay browser")
  .option("-b, --browser <browser>", "Browser to launch", "chromium")
  .option(
    "--attach <true|false>",
    "Whether to attach to the browser process after launching",
    false
  )
  .allowUnknownOption()
  .action(commandLaunchBrowser);

commandWithGlobalOptions("process <id>")
  .description("Upload a recording to the remote server and process it.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandProcessRecording);

commandWithGlobalOptions("upload-all")
  .description("Upload all recordings to the remote server.")
  .option("--api-key <key>", "Authentication API Key")
  .option("--filter <filter string>", "String to filter recordings")
  .option("--batch-size <batchSize number>", "Number of recordings to upload in parallel (max 25)")
  .option(
    "--include-in-progress",
    "Upload all recordings, including ones with an in progress status"
  )
  .action(commandUploadAllRecordings);

commandWithGlobalOptions("view <id>")
  .description("Load the devtools on a recording, uploading it if needed.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandViewRecording);

commandWithGlobalOptions("view-latest")
  .description("Load the devtools on the latest recording, uploading it if needed.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandViewLatestRecording);

commandWithGlobalOptions("rm <id>")
  .description("Remove a specific recording.")
  .action(commandRemoveRecording);

commandWithGlobalOptions("rm-all")
  .description("Remove all recordings.")
  .action(commandRemoveAllRecordings);

commandWithGlobalOptions("update-browsers")
  .description("Update browsers used in automation.")
  .action(commandUpdateBrowsers);

commandWithGlobalOptions("upload-sourcemaps")
  .requiredOption(
    "-g, --group <name>",
    "The name to group this sourcemap into, e.g. A commit SHA or release version."
  )
  .option("--api-key <key>", "Authentication API Key")
  .option("--dry-run", "Perform all of the usual CLI logic, but the final sourcemap upload.")
  .option(
    "-x, --extensions <exts>",
    "A comma-separated list of extensions to process. Defaults to '.js,.map'.",
    collectExtensions
  )
  .option("-i, --ignore <pattern>", "Ignore files that match this pattern", collectIgnorePatterns)
  .option("-q, --quiet", "Silence all stdout logging.")
  .option("-v, --verbose", "Output extra data to stdout when processing files.")
  .option("--batch-size <batchSize number>", "Number of sourcemaps to upload in parallel (max 25)")
  .option("--root <dirname>", "The base directory to use when computing relative paths")
  .option("--server <address>", "Alternate server to upload sourcemaps to.")
  .arguments("<paths...>")
  .action((filepaths, opts) => commandUploadSourcemaps(filepaths, opts));

commandWithGlobalOptions("metadata")
  .option("--init [metadata]")
  .option("--keys <keys...>", "Metadata keys to initialize")
  .option("--warn", "Warn on initialization error")
  .option("--filter <filter string>", "String to filter recordings")
  .action(commandMetadata);

commandWithGlobalOptions("login")
  .description("Log in interactively with your browser")
  .option("--directory <dir>", "Alternate recording directory.")
  .action(commandLogin);

program.parseAsync().catch(err => {
  console.error(err);
  process.exit(1);
});

function collectExtensions(value: string) {
  return value.split(",");
}
function collectIgnorePatterns(value: string, previous: Array<string> = []) {
  return previous.concat([value]);
}

function commandListAllRecordings(
  opts: Pick<CommandLineOptions, "directory" | "json" | "warn"> & FilterOptions
) {
  try {
    debug("Options", opts);

    const recordings = listAllRecordings({ ...opts, verbose: true });
    if (opts.json) {
      console.log(formatAllRecordingsJson(recordings));
    } else {
      console.log(formatAllRecordingsHumanReadable(recordings));
    }

    process.exit(0);
  } catch (e) {
    console.error("Failed to list all recordings");
    debug("removeRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandUploadRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const recordingId = await uploadRecording(id, { ...opts, verbose: true });
    process.exit(recordingId || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to upload recording");
    debug("uploadRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandLaunchBrowser(
  url: string | undefined,
  opts: Pick<CommandLineOptions, "warn"> & {
    browser: string | undefined;
    attach: boolean | undefined;
  }
) {
  try {
    debug("Options", opts);

    const browser = fuzzyBrowserName(opts.browser) || "chromium";
    assertValidBrowserName(browser);

    const attach = opts.attach || false;

    await launchBrowser(browser, attach, [url || "about:blank"]);
    process.exit(0);
  } catch (e) {
    console.error("Failed to launch browser");
    debug("launchBrowser error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandProcessRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const recordingId = await processRecording(id, { ...opts, verbose: true });
    process.exit(recordingId || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to process recording");
    debug("processRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandUploadAllRecordings(opts: CommandLineOptions & UploadOptions) {
  try {
    debug("Options", opts);

    const uploadedAll = await uploadAllRecordings({ ...opts, verbose: true });
    process.exit(uploadedAll || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to upload all recordings");
    debug("uploadAllRecordings error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandViewRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const viewed = await viewRecording(id, { ...opts, verbose: true });
    process.exit(viewed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to view recording");
    debug("viewRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandViewLatestRecording(opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const viewed = await viewLatestRecording({ ...opts, verbose: true });
    process.exit(viewed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to view recording");
    debug("viewLatestRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

function commandRemoveRecording(id: string, opts: Pick<CommandLineOptions, "directory" | "warn">) {
  try {
    debug("Options", opts);

    const removed = removeRecording(id, { ...opts, verbose: true });
    process.exit(removed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to remove recording");
    debug("removeRecording error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

function commandRemoveAllRecordings(opts: Pick<CommandLineOptions, "directory" | "warn">) {
  try {
    debug("Options", opts);

    removeAllRecordings({ ...opts, verbose: true });
    process.exit(0);
  } catch (e) {
    console.error("Failed to remove all recordings");
    debug("removeAllRecordings error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandUpdateBrowsers(opts: Pick<CommandLineOptions, "directory" | "warn">) {
  try {
    debug("Options", opts);

    await updateBrowsers({ ...opts, verbose: true });
    process.exit(0);
  } catch (e) {
    console.error("Failed to updated browsers");
    debug("updateBrowser error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandUploadSourcemaps(
  filepaths: Array<string>,
  cliOpts: SourcemapUploadOptions & Pick<CommandLineOptions, "apiKey" | "warn">
): Promise<void> {
  debug("Options", cliOpts);

  const { quiet, verbose, apiKey, batchSize, warn, ...uploadOpts } = cliOpts;

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

  try {
    await uploadSourceMaps({
      filepaths,
      key: apiKey,
      ...uploadOpts,
      concurrency: batchSize,
      log,
    });

    process.exit(0);
  } catch (e) {
    console.error("Failed to upload source maps");
    debug("uploadSourceMaps error %o", e);

    process.exit(warn ? 0 : 1);
  }
}

async function commandMetadata(opts: MetadataOptions & FilterOptions) {
  try {
    debug("Options", opts);

    await updateMetadata({ ...opts, verbose: true });
    process.exit(0);
  } catch (e) {
    console.error("Failed to update recording metadata");
    debug("updateMetadata error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}

async function commandLogin(opts: CommandLineOptions) {
  try {
    const ok = await maybeAuthenticateUser({
      ...opts,
      verbose: true,
    });
    process.exit(ok || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to login");
    debug("maybeAuthenticateUser error %o", e);

    process.exit(opts.warn ? 0 : 1);
  }
}
