import dbg from "./debug";
import fs from "fs";
import path from "path";
import { getPackument } from "query-registry";
import { compare } from "semver";
import { getCurrentVersion } from "./utils";

// requiring v4 explicitly because it's the last version with commonjs support.
// Should be upgraded to the latest when converting this code to es modules.
import pMap from "p-map";

import { ReplayClient } from "./upload";
import {
  ensurePuppeteerBrowsersInstalled,
  ensurePlaywrightBrowsersInstalled,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
  updateBrowsers,
  ensureBrowsersInstalled,
  getExecutablePath,
} from "./install";
import { exponentialBackoffRetry, getDirectory, maybeLog, openExecutable } from "./utils";
import { spawn } from "child_process";
import {
  BrowserName,
  ExternalRecordingEntry,
  FilterOptions,
  LaunchOptions,
  ListOptions,
  MetadataOptions,
  Options,
  RecordingEntry,
  SourceMapEntry,
  UploadAllOptions,
  UploadOptions,
} from "./types";
import { add, sanitize, source as sourceMetadata, test as testMetadata } from "../metadata";
import jsonata from "jsonata";
import { readToken } from "./auth";
import {
  readRecordings,
  removeRecordingsFile,
  removeRecordingFromLog,
  addRecordingEvent,
} from "./recordingLog";
export type { BrowserName, RecordingEntry } from "./types";

const debug = dbg("replay:cli");

export function updateStatus(recording: RecordingEntry, status: RecordingEntry["status"]) {
  // Once a recording enters an unusable or crashed status, don't change it
  // except to mark crashes as uploaded.
  if (
    recording.status == "unusable" ||
    recording.status == "crashUploaded" ||
    (recording.status == "crashed" && status != "crashUploaded")
  ) {
    return;
  }
  recording.status = status;
}

export function filterRecordings(
  recordings: RecordingEntry[],
  filter: FilterOptions["filter"],
  includeCrashes: FilterOptions["includeCrashes"]
) {
  let filteredRecordings = recordings;
  debug("Recording log contains %d replays", recordings.length);
  if (filter && typeof filter === "string") {
    debug("Using filter: %s", filter);
    const exp = jsonata(`$filter($, ${filter})[]`);
    filteredRecordings = exp.evaluate(recordings) || [];

    debug("Filtering resulted in %d replays", filteredRecordings.length);
  } else if (typeof filter === "function") {
    debug("Using filter function");
    filteredRecordings = recordings.filter(filter);

    debug("Filtering resulted in %d replays", filteredRecordings.length);
  }

  if (includeCrashes) {
    recordings.forEach(r => {
      if (r.status === "crashed" && !filteredRecordings.includes(r)) {
        filteredRecordings.push(r);
      }
    });
  }

  return filteredRecordings;
}

// Convert a recording into a format for listing.
function listRecording(recording: RecordingEntry): ExternalRecordingEntry {
  // Remove properties we only use internally.
  const { buildId, crashData, ...recordingWithoutInternalProperties } = recording;
  return recordingWithoutInternalProperties;
}

function listAllRecordings(opts: Options & ListOptions = {}) {
  const recordings = readRecordings(opts.directory);

  if (opts.all) {
    return filterRecordings(recordings, opts.filter, opts.includeCrashes).map(listRecording);
  }

  const uploadableRecordings = recordings.filter(recording =>
    ["onDisk", "startedWrite", "crashed"].includes(recording.status)
  );
  return filterRecordings(uploadableRecordings, opts.filter, opts.includeCrashes).map(
    listRecording
  );
}

function uploadSkipReason(recording: RecordingEntry) {
  // Status values where there is something worth uploading.
  const canUploadStatus = ["onDisk", "startedWrite", "startedUpload", "crashed"];
  if (!canUploadStatus.includes(recording.status)) {
    return `wrong recording status ${recording.status}`;
  }
  if (!recording.path && recording.status != "crashed") {
    return "recording not saved to disk";
  }
  return null;
}

function getServer(opts: Options) {
  return (
    opts.server ||
    process.env.RECORD_REPLAY_SERVER ||
    process.env.REPLAY_SERVER ||
    "wss://dispatch.replay.io"
  );
}

async function doUploadCrash(
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: any
) {
  const client = new ReplayClient();
  maybeLog(verbose, `Starting crash data upload for ${recording.id}...`);
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    maybeLog(verbose, `Crash data upload failed: can't connect to server ${server}`);
    return null;
  }

  const crashData = recording.crashData || [];
  crashData.push({
    kind: "recordingMetadata",
    recordingId: recording.id,
  });

  await Promise.all(
    crashData.map(async data => {
      await client.connectionReportCrash(data);
    })
  );
  addRecordingEvent(dir, "crashUploaded", recording.id, { server });
  maybeLog(verbose, `Crash data upload finished.`);
  client.closeConnection();
}

class RecordingUploadError extends Error {
  interiorError?: any;

  constructor(message?: string, interiorError?: any) {
    super(message);
    this.name = "RecordingUploadError";
    this.interiorError = interiorError;
    Object.setPrototypeOf(this, new.target.prototype); // Restore error prototype chain.
  }
}

function handleUploadingError(
  err: string,
  strict: boolean,
  verbose?: boolean,
  interiorError?: any
) {
  maybeLog(verbose, `Upload failed: ${err}`);

  if (interiorError) {
    debug(interiorError);
  }

  if (strict) {
    throw new RecordingUploadError(err, interiorError);
  }
}

async function doUploadRecording(
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: any,
  removeAssets: boolean = false,
  strict: boolean = false
) {
  debug("Uploading %s from %s to %s", recording.id, dir, server);
  maybeLog(verbose, `Starting upload for ${recording.id}...`);

  if (recording.status == "uploaded" && recording.recordingId) {
    maybeLog(verbose, `Already uploaded: ${recording.recordingId}`);

    return recording.recordingId;
  }

  const reason = uploadSkipReason(recording);
  if (reason) {
    handleUploadingError(reason, strict, verbose);
    return null;
  }

  if (!apiKey) {
    apiKey = await readToken({ directory: dir });
  }

  if (recording.status == "crashed") {
    debug("Uploading crash %o", recording);
    await doUploadCrash(dir, server, recording, verbose, apiKey, agent);
    maybeLog(verbose, `Crash report uploaded for ${recording.id}`);
    if (removeAssets) {
      removeRecordingAssets(recording, { directory: dir });
    }
    return recording.id;
  }

  const { size } = await fs.promises.stat(recording.path!);

  debug("Uploading recording %o", recording);
  const client = new ReplayClient();
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    handleUploadingError(`Cannot connect to server ${server}`, strict, verbose);
    return null;
  }

  // validate metadata before uploading so invalid data can block the upload
  const metadata = recording.metadata
    ? await client.buildRecordingMetadata(recording.metadata, { verbose })
    : null;
  const { recordingId, uploadLink } = await client.connectionBeginRecordingUpload(
    recording.id,
    recording.buildId!,
    size
  );
  debug(`Created remote recording ${recordingId}`);
  if (metadata) {
    try {
      await client.setRecordingMetadata(recordingId, metadata);
    } catch (e) {
      handleUploadingError(`Failed to set recording metadata ${e}`, strict, verbose, e);
    }
  }

  addRecordingEvent(dir, "uploadStarted", recording.id, {
    server,
    recordingId,
  });

  await exponentialBackoffRetry(
    () => client.uploadRecording(recording.path!, uploadLink, size),
    e => {
      debug("Upload failed with error:  %j", e);
    }
  );

  debug("%s: Uploaded %d bytes", recordingId, size);

  await client.connectionEndRecordingUpload(recording.id);

  await pMap(
    recording.sourcemaps,
    async (sourcemap: SourceMapEntry) => {
      try {
        debug("Uploading sourcemap %s for recording %s", sourcemap.path, recording.id);
        const contents = fs.readFileSync(sourcemap.path, "utf8");
        const sourcemapId = await client.connectionUploadSourcemap(
          recordingId,
          sourcemap,
          contents
        );
        await pMap(
          sourcemap.originalSources,
          originalSource => {
            debug(
              "Uploading original source %s for sourcemap %s for recording %s",
              originalSource.path,
              sourcemap.path,
              recording.id
            );
            const contents = fs.readFileSync(originalSource.path, "utf8");
            return client.connectionUploadOriginalSource(
              recordingId,
              sourcemapId,
              originalSource,
              contents
            );
          },
          { concurrency: 5, stopOnError: false }
        );
      } catch (e) {
        handleUploadingError(
          `Cannot upload sourcemap ${sourcemap.path} from disk: ${e}`,
          strict,
          verbose,
          e
        );
      }
    },
    { concurrency: 10, stopOnError: false }
  );

  if (removeAssets) {
    removeRecordingAssets(recording, { directory: dir });
  }

  addRecordingEvent(dir, "uploadFinished", recording.id);
  maybeLog(
    verbose,
    `Upload finished! View your Replay at: https://app.replay.io/recording/${recordingId}`
  );
  client.closeConnection();
  return recordingId;
}

async function uploadRecording(id: string, opts: UploadOptions = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);

  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return null;
  }

  return doUploadRecording(
    dir,
    server,
    recording,
    opts.verbose,
    opts.apiKey,
    opts.agent,
    true,
    opts.strict
  );
}

async function processUploadedRecording(recordingId: string, opts: Options) {
  const server = getServer(opts);
  const { verbose, agent } = opts;
  let apiKey = opts.apiKey;

  maybeLog(verbose, `Processing recording ${recordingId}...`);

  if (!apiKey) {
    apiKey = await readToken(opts);
  }

  const client = new ReplayClient();
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    maybeLog(verbose, `Processing failed: can't connect to server ${server}`);
    return false;
  }

  try {
    const error = await client.connectionWaitForProcessed(recordingId);
    if (error) {
      maybeLog(verbose, `Processing failed: ${error}`);
      return false;
    }
  } finally {
    client.closeConnection();
  }

  maybeLog(verbose, "Finished processing.");
  return true;
}

async function processRecording(id: string, opts: Options = {}) {
  const recordingId = await uploadRecording(id, opts);
  if (!recordingId) {
    return null;
  }
  const succeeded = await processUploadedRecording(recordingId, opts);
  return succeeded ? recordingId : null;
}

async function uploadAllRecordings(opts: UploadAllOptions = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const allRecordings = readRecordings(dir).filter(r => !uploadSkipReason(r));
  const recordings = filterRecordings(allRecordings, opts.filter, opts.includeCrashes);

  if (
    allRecordings.some(r => r.status === "crashed") &&
    !recordings.some(r => r.status === "crashed") &&
    opts.filter &&
    !opts.includeCrashes
  ) {
    maybeLog(
      opts.verbose,
      `\n⚠️ Warning: Some crash reports were created but will not be uploaded because of the provided filter. Add --include-crashes to upload crash reports.\n`
    );
  }

  if (recordings.length === 0) {
    if (opts.filter && allRecordings.length > 0) {
      maybeLog(opts.verbose, `No replays matched the provided filter`);
    } else {
      maybeLog(opts.verbose, `No replays were found to upload`);
    }

    return true;
  }

  maybeLog(opts.verbose, `Starting upload of ${recordings.length} replays`);
  if (opts.batchSize) {
    debug("Batching upload in groups of %d", opts.batchSize);
  }

  const batchSize = Math.min(opts.batchSize || 20, 25);

  const recordingIds: (string | null)[] = await pMap(
    recordings,
    (r: RecordingEntry) =>
      doUploadRecording(dir, server, r, opts.verbose, opts.apiKey, opts.agent, false, opts.strict),
    { concurrency: batchSize, stopOnError: false }
  );

  recordingIds.forEach(id => {
    const recording = recordings.find(r => r.id === id);
    if (!recording) return;

    removeRecordingAssets(recording, opts);
  });

  return recordingIds.every(r => r !== null);
}

async function doViewRecording(
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: any,
  viewServer?: string
) {
  let recordingId;
  if (recording.status === "crashUploaded") {
    maybeLog(verbose, "Crash report already uploaded");
    return true;
  } else if (recording.status == "uploaded") {
    recordingId = recording.recordingId;
    server = recording.server!;
  } else {
    recordingId = await doUploadRecording(dir, server, recording, verbose, apiKey, agent, true);

    if (!recordingId) {
      return false;
    } else if (recording.status === "crashed") {
      return true;
    }
  }
  const devtools = viewServer ?? "https://app.replay.io";
  const dispatch = server != "wss://dispatch.replay.io" ? `&dispatch=${server}` : "";
  spawn(openExecutable(), [`${devtools}?id=${recordingId}${dispatch}`]);
  return true;
}

async function viewRecording(id: string, opts: Options = {}) {
  let server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);
  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  return doViewRecording(dir, server, recording, opts.verbose, opts.apiKey, opts.agent);
}

async function viewLatestRecording(opts: Options = {}) {
  let server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  if (!recordings.length) {
    maybeLog(opts.verbose, "No recordings to view");
    return false;
  }
  return doViewRecording(
    dir,
    server,
    recordings[recordings.length - 1],
    opts.verbose,
    opts.apiKey,
    opts.agent,
    opts.viewServer
  );
}

function maybeRemoveAssetFile(asset?: string) {
  if (asset) {
    try {
      if (fs.existsSync(asset)) {
        debug("Removing asset file %s", asset);
        fs.unlinkSync(asset);
      }
    } catch (e) {
      debug("Failed to remove asset file: %s", e);
    }
  }
}

function removeRecording(id: string, opts: Options = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);
  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  removeRecordingAssets(recording, opts);
  removeRecordingFromLog(dir, id);
  return true;
}

function getRecordingAssetFiles(recording: RecordingEntry) {
  const assetFiles: string[] = [];
  if (recording.path) {
    assetFiles.push(recording.path);
  }

  recording.sourcemaps.forEach(sm => {
    assetFiles.push(sm.path);
    assetFiles.push(sm.path.replace(/\.map$/, ".lookup"));
    sm.originalSources.forEach(o => assetFiles.push(o.path));
  });

  return assetFiles;
}

function removeRecordingAssets(recording: RecordingEntry, opts?: Pick<Options, "directory">) {
  const localRecordings = listAllRecordings({
    ...opts,
    filter: r => r.status !== "uploaded" && r.status !== "crashUploaded" && r.id !== recording.id,
  });

  const localRecordingAssetFiles = new Set(localRecordings.flatMap(getRecordingAssetFiles));
  const assetFiles = getRecordingAssetFiles(recording);
  assetFiles.forEach(file => {
    if (!localRecordingAssetFiles.has(file)) {
      maybeRemoveAssetFile(file);
    }
  });
}

function removeAllRecordings(opts: Options = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  recordings.forEach(r => removeRecordingAssets(r, opts));

  removeRecordingsFile(dir);
}

function addLocalRecordingMetadata(recordingId: string, metadata: Record<string, unknown>) {
  add(recordingId, metadata);
}

async function updateMetadata({
  init: metadata,
  keys = [],
  filter,
  includeCrashes,
  verbose,
  warn,
  directory,
}: MetadataOptions & FilterOptions) {
  try {
    let md: any = {};
    if (metadata) {
      md = JSON.parse(metadata);
    }

    const keyedObjects = await pMap<string, Record<string, any> | null>(keys, async v => {
      try {
        switch (v) {
          case "source":
            return await sourceMetadata.init(md.source || {});
          case "test":
            return await testMetadata.init(md.test || {});
        }
      } catch (e) {
        debug("Metadata initialization error: %o", e);
        if (!warn) {
          throw e;
        }

        console.warn(`Unable to initialize metadata field: "${v}"`);
        if (e instanceof Error) {
          console.warn(" ->", e.message);
        }
      }

      return null;
    });

    const data = Object.assign(md, ...keyedObjects);
    const sanitized = await sanitize(data);

    debug("Sanitized metadata: %O", sanitized);

    const recordings = listAllRecordings({ directory, filter, includeCrashes });

    recordings.forEach(r => {
      maybeLog(verbose, `Setting metadata for ${r.id}`);
      add(r.id, sanitized);
    });
  } catch (e) {
    console.error("Failed to set recording metadata");
    console.error(e);

    process.exit(1);
  }
}

async function launchBrowser(
  browserName: BrowserName,
  args: string[] = [],
  record: boolean = false,
  opts?: Options & LaunchOptions
) {
  debug("launchBrowser: %s %o %s %o", browserName, args, record, opts);
  const execPath = getExecutablePath(browserName, opts);
  if (!execPath) {
    throw new Error(`${browserName} not supported on the current platform`);
  }

  if (!fs.existsSync(execPath)) {
    maybeLog(opts?.verbose, `Installing ${browserName}`);
    await ensureBrowsersInstalled(browserName, false, opts);
  }

  const profileDir = path.join(getDirectory(opts), "runtimes", "profiles", browserName);

  const browserArgs: Record<BrowserName, string[]> = {
    chromium: [
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      ...args,
    ],
    firefox: ["-foreground", ...args],
  };

  const env = {
    ...process.env,
  };

  if (record) {
    env.RECORD_ALL_CONTENT = "1";
  }

  if (opts?.directory) {
    env.RECORD_REPLAY_DIRECTORY = opts?.directory;
  }

  const proc = spawn(execPath, browserArgs[browserName], {
    detached: !opts?.attach,
    env,
    stdio: "inherit",
  });
  if (!opts?.attach) {
    proc.unref();
  } else {
    // Wait for the browser process to finish.
    await new Promise<void>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("exit", (code, signal) => {
        if (code || signal) {
          reject(new Error(`Process failed code=${code}, signal=${signal}`));
        } else {
          resolve();
        }
      });
    });
  }

  return proc;
}

async function version() {
  const version = getCurrentVersion();
  let update = false;
  let latest: string | null = null;

  try {
    const data = await getPackument({ name: "@replayio/replay" });
    latest = data.distTags.latest;

    if (compare(version, latest) < 0) {
      update = true;
    }
  } catch (e) {
    debug("Error retrieving latest package info: %o", e);
  }

  return {
    version,
    update,
    latest,
  };
}

export {
  addLocalRecordingMetadata,
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
  // These methods aren't documented or available via the CLI, and are used by other
  // replay NPM packages.
  ensurePlaywrightBrowsersInstalled,
  ensurePuppeteerBrowsersInstalled,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
};
