import { LogCallback, uploadSourceMaps } from "@replayio/sourcemap-upload";
import { program } from "commander";
import dbg, { printLogPath } from "./debug";
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
  version,
} from "./main";
import {
  FilterOptions,
  LaunchOptions,
  MetadataOptions,
  Options,
  SourcemapUploadOptions,
  UploadAllOptions,
} from "./types";
import { assertValidBrowserName, fuzzyBrowserName } from "./utils";
import { initLaunchDarklyContextFromApiKey, maybeAuthenticateUser } from "./auth";
import { getLaunchDarkly } from "./launchdarkly";

export interface CommandLineOptions extends Options {
  /**
   * JSON output
   */
  json?: boolean;

  /**
   * Warn of failures but do not quit with a non-zero exit code
   */
  warn?: boolean;

  /**
   * Pass along browser commandline arguments
   */
  browserArgs: string;
}

const debug = dbg("replay:cli");

// Create command with global options
function commandWithGlobalOptions(cmdString: string) {
  return program
    .command(cmdString)
    .option("--warn", "Terminate with a 0 exit code on error")
    .option("--directory <dir>", "Alternate recording directory")
    .option("--server <address>", "Alternate server to upload recordings to")
    .hook("preAction", async cmd => {
      try {
        await initLaunchDarklyContextFromApiKey(cmd.opts());
      } catch (e) {
        debug("LaunchDarkly profile is anonymous %o", e);
      }
    });
}

// TODO(dmiller): `--json` should probably be a global option that applies to all commands.
commandWithGlobalOptions("ls")
  .description("List information about all recordings.")
  .option("-a, --all", "Include all recordings")
  .option("--json", "Output in JSON format")
  .option("--filter <filter string>", "String to filter recordings")
  .option("--include-crashes", "Always include crash reports")
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

commandWithGlobalOptions("record [url]")
  .description("Launch the replay browser and start recording")
  .option("-b, --browser <browser>", "Browser to launch", "chromium")
  .option("--browser-args <args>", "Browser arguments", "")
  .option(
    "--attach <true|false>",
    "Whether to attach to the browser process after launching",
    false
  )
  .allowUnknownOption()
  .action(commandLaunchBrowserAndRecord);

commandWithGlobalOptions("process <id>")
  .description("Upload a recording to the remote server and process it.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandProcessRecording);

commandWithGlobalOptions("upload-all")
  .description("Upload all recordings to the remote server.")
  .option("--api-key <key>", "Authentication API Key")
  .option("--filter <filter string>", "String to filter recordings")
  .option("--batch-size <batchSize number>", "Number of recordings to upload in parallel (max 25)")
  .option("--include-crashes", "Always include crash reports")
  .action(commandUploadAllRecordings);

commandWithGlobalOptions("view <id>")
  .description("Load the devtools on a recording, uploading it if needed.")
  .option("--view-server <view-server>", "Alternate server to view recording from.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandViewRecording);

commandWithGlobalOptions("view-latest")
  .description("Load the devtools on the latest recording, uploading it if needed.")
  .option("--view-server <view-server>", "Alternate server to view recording from.")
  .option("--api-key <key>", "Authentication API Key")
  .action(commandViewLatestRecording);

commandWithGlobalOptions("rm <id>")
  .description("Remove a specific recording.")
  .action(commandRemoveRecording);

commandWithGlobalOptions("rm-all")
  .description("Remove all recordings.")
  .action(commandRemoveAllRecordings);

commandWithGlobalOptions("update-browsers")
  .description(
    "Update your installed Replay runtimes. Optional argument: Comma-separated list of replay runtimes. Possible values: chromium,firefox.\n  Node not yet supported."
  )
  .arguments("[<browsers...>]")
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
  .arguments("<paths...>")
  .action((filepaths, opts) => commandUploadSourcemaps(filepaths, opts));

commandWithGlobalOptions("metadata")
  .option("--init [metadata]")
  .option("--keys <keys...>", "Metadata keys to initialize")
  .option("--filter <filter string>", "String to filter recordings")
  .action(commandMetadata);

commandWithGlobalOptions("login")
  .description("Log in interactively with your browser")
  .action(commandLogin);

commandWithGlobalOptions("version")
  .description("Returns the current version of the CLI")
  .option("--json", "Output in JSON format")
  .action(commandVersion);

async function exitCommand(exitCode: number) {
  await getLaunchDarkly().close();
  process.exit(exitCode);
}

program.parseAsync().catch(async err => {
  console.error(err);
  await exitCommand(1);
});

function collectExtensions(value: string) {
  return value.split(",");
}
function collectIgnorePatterns(value: string, previous: Array<string> = []) {
  return previous.concat([value]);
}

async function commandListAllRecordings(
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

    await exitCommand(0);
  } catch (e) {
    console.error("Failed to list all recordings");
    printLogPath();
    debug("removeRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandUploadRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const recordingId = await uploadRecording(id, { ...opts, verbose: true });
    if (!recordingId) {
      printLogPath();
    }

    await exitCommand(recordingId || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to upload recording");
    printLogPath();
    debug("uploadRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandLaunchBrowser(
  url: string | undefined,
  opts: Pick<CommandLineOptions, "warn" | "directory"> & LaunchOptions
) {
  try {
    debug("Options", opts);

    const browser = fuzzyBrowserName(opts.browser) || "chromium";
    assertValidBrowserName(browser);

    await launchBrowser(browser, [url || "about:blank"], false, { ...opts, verbose: true });
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to launch browser");
    printLogPath();
    debug("launchBrowser error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandLaunchBrowserAndRecord(
  url: string | undefined,
  opts: Pick<CommandLineOptions, "warn" | "directory" | "browserArgs"> & LaunchOptions
) {
  try {
    debug("Options", opts);

    const browser = fuzzyBrowserName(opts.browser) || "chromium";
    assertValidBrowserName(browser);

    await launchBrowser(browser, [url || "about:blank", opts.browserArgs], true, {
      ...opts,
      verbose: true,
    });
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to launch browser");
    printLogPath();
    debug("launchBrowser error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandProcessRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const recordingId = await processRecording(id, { ...opts, verbose: true });
    if (!recordingId) {
      printLogPath();
    }

    await exitCommand(recordingId || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to process recording");
    printLogPath();
    debug("processRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandUploadAllRecordings(opts: CommandLineOptions & UploadAllOptions) {
  try {
    debug("Options", opts);

    const uploadedAll = await uploadAllRecordings({ ...opts, verbose: true });
    await exitCommand(uploadedAll || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to upload all recordings");
    printLogPath();
    debug("uploadAllRecordings error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandViewRecording(id: string, opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const viewed = await viewRecording(id, { ...opts, verbose: true });
    await exitCommand(viewed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to view recording");
    printLogPath();
    debug("viewRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandViewLatestRecording(opts: CommandLineOptions) {
  try {
    debug("Options", opts);

    const viewed = await viewLatestRecording({ ...opts, verbose: true });
    if (!viewed) {
      printLogPath();
    }

    await exitCommand(viewed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to view recording");
    printLogPath();
    debug("viewLatestRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandRemoveRecording(
  id: string,
  opts: Pick<CommandLineOptions, "directory" | "warn">
) {
  try {
    debug("Options", opts);

    const removed = removeRecording(id, { ...opts, verbose: true });
    await exitCommand(removed || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to remove recording");
    printLogPath();
    debug("removeRecording error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandRemoveAllRecordings(opts: Pick<CommandLineOptions, "directory" | "warn">) {
  try {
    debug("Options", opts);

    removeAllRecordings({ ...opts, verbose: true });
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to remove all recordings");
    printLogPath();
    debug("removeAllRecordings error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandUpdateBrowsers(
  browsers: string,
  opts: Pick<CommandLineOptions, "directory" | "warn">
) {
  try {
    debug("Options", opts);

    await updateBrowsers({
      ...opts,
      browsers: browsers?.split(",").map(fuzzyBrowserName),
      verbose: true,
    });
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to updated browsers");
    printLogPath();
    debug("updateBrowser error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
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

    await exitCommand(0);
  } catch (e) {
    console.error("Failed to upload source maps");
    debug("uploadSourceMaps error %o", e);

    await exitCommand(warn ? 0 : 1);
  }
}

async function commandMetadata(opts: MetadataOptions & FilterOptions) {
  try {
    debug("Options", opts);

    await updateMetadata({ ...opts, verbose: true });
    printLogPath();
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to update recording metadata");
    debug("updateMetadata error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandLogin(opts: CommandLineOptions) {
  try {
    const ok = await maybeAuthenticateUser({
      ...opts,
      verbose: true,
    });
    await exitCommand(ok || opts.warn ? 0 : 1);
  } catch (e) {
    console.error("Failed to login");
    printLogPath();
    debug("maybeAuthenticateUser error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}

async function commandVersion(opts: CommandLineOptions) {
  try {
    const versionInfo = await version();

    if (opts.json) {
      console.log(JSON.stringify(versionInfo));
    } else {
      const { version, update, latest } = versionInfo;
      console.log(`\n@replayio/replay version ${version}`);
      if (update) {
        console.log(`A newer version (${latest}) of the Replay CLI is available`);
      }
    }
    await exitCommand(0);
  } catch (e) {
    console.error("Failed to get version information");
    printLogPath();
    debug("commandVersion error %o", e);

    await exitCommand(opts.warn ? 0 : 1);
  }
}
