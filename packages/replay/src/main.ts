import fs from "fs";
import path from "path";
import { getPackument } from "query-registry";
import { compare } from "semver";
import { query } from "./graphql";
import { getCurrentVersion, getHttpAgent } from "./utils";

// requiring v4 explicitly because it's the last version with commonjs support.
// Should be upgraded to the latest when converting this code to es modules.
import pMap from "p-map";

import { spawn } from "child_process";
import jsonata from "jsonata";
import { add, sanitize, source as sourceMetadata, test as testMetadata } from "./metadata";
import { readToken } from "./auth";
import { ProtocolError } from "./client";
import {
  ensureBrowsersInstalled,
  ensurePlaywrightBrowsersInstalled,
  ensurePuppeteerBrowsersInstalled,
  getExecutablePath,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
  updateBrowsers,
} from "./install";
import {
  addRecordingEvent,
  readRecordings,
  removeRecordingFromLog,
  removeRecordingsFile,
} from "./recordingLog";
import {
  BrowserName,
  FilterOptions,
  LaunchOptions,
  ListOptions,
  MetadataOptions,
  Options,
  RecordingEntry,
  RecordingMetadata,
  SourceMapEntry,
  UploadAllOptions,
  UploadOptions,
  type ExternalRecordingEntry,
  type UnstructuredMetadata,
  Ctx,
} from "./types";
import { ReplayClient } from "./upload";
import { exponentialBackoffRetry, getDirectory, maybeLog, openExecutable } from "./utils";
import { getLaunchDarkly } from "./launchdarkly";
import { Agent, AgentOptions } from "http";
export type { BrowserName, RecordingEntry } from "./types";

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
  includeCrashes: FilterOptions["includeCrashes"],
  ctx?: Ctx
) {
  let filteredRecordings = recordings;
  ctx?.debug("Recording log contains %d replays", recordings.length);
  if (filter && typeof filter === "string") {
    ctx?.debug("Using filter: %s", filter);
    const exp = jsonata(`$filter($, ${filter})[]`);
    filteredRecordings = exp.evaluate(recordings) || [];

    ctx?.debug("Filtering resulted in %d replays", filteredRecordings.length);
  } else if (typeof filter === "function") {
    ctx?.debug("Using filter function");
    filteredRecordings = recordings.filter(filter);

    ctx?.debug("Filtering resulted in %d replays", filteredRecordings.length);
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
  ctx: Partial<Ctx> | undefined,
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: Agent
) {
  const client = new ReplayClient(ctx);
  maybeLog(ctx, verbose, `Starting crash data upload for ${recording.id}...`);
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    maybeLog(ctx, verbose, `Crash data upload failed: can't connect to server ${server}`);
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
  addRecordingEvent(ctx, dir, "crashUploaded", recording.id, { server });
  maybeLog(ctx, verbose, `Crash data upload finished.`);
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
  ctx: Partial<Ctx> | undefined,
  err: string,
  strict: boolean,
  verbose?: boolean,
  interiorError?: any
) {
  maybeLog(ctx, verbose, `Upload failed: ${err}`);

  if (interiorError) {
    ctx?.debug?.(interiorError);
  }

  if (strict) {
    throw new RecordingUploadError(err, interiorError);
  }
}

async function validateMetadata(
  client: ReplayClient,
  metadata: Record<string, unknown> | null,
  verbose: boolean | undefined
): Promise<RecordingMetadata | null> {
  return metadata ? await client.buildRecordingMetadata(metadata, { verbose }) : null;
}

async function setMetadata(
  ctx: Partial<Ctx> | undefined,
  client: ReplayClient,
  recordingId: string,
  metadata: RecordingMetadata | null,
  strict: boolean,
  verbose: boolean
) {
  if (metadata) {
    try {
      await exponentialBackoffRetry(
        () => client.setRecordingMetadata(recordingId, metadata),
        e => {
          ctx?.debug?.("Failed to set recording metadata. Will be retried:  %j", e);
        }
      );
    } catch (e) {
      handleUploadingError(ctx, `Failed to set recording metadata ${e}`, strict, verbose, e);
    }
  }
}

const MIN_MULTIPART_UPLOAD_SIZE = 5 * 1024 * 1024;
async function multipartUploadRecording(
  ctx: Partial<Ctx> | undefined,
  server: string,
  client: ReplayClient,
  dir: string,
  recording: RecordingEntry,
  metadata: RecordingMetadata | null,
  size: number,
  strict: boolean,
  verbose: boolean,
  agentOptions?: AgentOptions
) {
  const requestPartChunkSize =
    parseInt(process.env.REPLAY_MULTIPART_UPLOAD_CHUNK || "", 10) || undefined;
  const { recordingId, uploadId, partLinks, chunkSize } =
    await client.connectionBeginRecordingMultipartUpload(
      recording.id,
      recording.buildId!,
      size,
      requestPartChunkSize
    );
  setMetadata(ctx, client, recordingId, metadata, strict, verbose);
  addRecordingEvent(ctx, dir, "uploadStarted", recording.id, {
    server,
    recordingId,
  });
  const eTags = await client.uploadRecordingInParts(
    recording.path!,
    partLinks,
    chunkSize,
    agentOptions
  );

  await client.connectionEndRecordingMultipartUpload(recording.id, uploadId, eTags);
  return recordingId;
}

async function directUploadRecording(
  ctx: Partial<Ctx> | undefined,
  server: string,
  client: ReplayClient,
  dir: string,
  recording: RecordingEntry,
  metadata: RecordingMetadata | null,
  size: number,
  strict: boolean,
  verbose: boolean
) {
  const { recordingId, uploadLink } = await client.connectionBeginRecordingUpload(
    recording.id,
    recording.buildId!,
    size
  );
  setMetadata(ctx, client, recordingId, metadata, strict, verbose);
  addRecordingEvent(ctx, dir, "uploadStarted", recording.id, {
    server,
    recordingId,
  });
  await exponentialBackoffRetry(
    () => client.uploadRecording(recording.path!, uploadLink, size),
    e => {
      ctx?.debug?.("Upload failed with error. Will be retried:  %j", e);
    }
  );

  ctx?.debug?.("%s: Uploaded %d bytes", recordingId, size);

  await client.connectionEndRecordingUpload(recording.id);
  return recordingId;
}

async function doUploadRecording(
  ctx: Partial<Ctx> | undefined = {},
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose: boolean = false,
  apiKey?: string,
  agentOptions?: AgentOptions,
  removeAssets: boolean = false,
  strict: boolean = false
) {
  ctx.debug?.("Uploading %s from %s to %s", recording.id, dir, server);
  maybeLog(ctx, verbose, `Starting upload for ${recording.id}...`);

  if (recording.status == "uploaded" && recording.recordingId) {
    maybeLog(ctx, verbose, `Already uploaded: ${recording.recordingId}`);

    return recording.recordingId;
  }

  const reason = uploadSkipReason(recording);
  if (reason) {
    handleUploadingError(ctx, reason, strict, verbose);
    return null;
  }

  if (!apiKey) {
    apiKey = await readToken(ctx, { directory: dir });
  }

  const agent = getHttpAgent(server, agentOptions);

  if (recording.status == "crashed") {
    ctx.debug?.("Uploading crash %o", recording);
    await doUploadCrash(ctx, dir, server, recording, verbose, apiKey, agent);
    maybeLog(ctx, verbose, `Crash report uploaded for ${recording.id}`);
    if (removeAssets) {
      removeRecordingAssets(ctx, recording, { directory: dir });
    }
    return recording.id;
  }

  const { size } = await fs.promises.stat(recording.path!);

  ctx.debug?.("Uploading recording %o", recording);
  const client = new ReplayClient(ctx);
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    handleUploadingError(ctx, `Cannot connect to server ${server}`, strict, verbose);
    return null;
  }

  // validate metadata before uploading so invalid data can block the upload
  const metadata = await validateMetadata(client, recording.metadata, verbose);

  let recordingId: string;
  try {
    const isMultipartEnabled = await getLaunchDarkly(ctx).isEnabled("cli-multipart-upload", false);
    if (size > MIN_MULTIPART_UPLOAD_SIZE && isMultipartEnabled) {
      recordingId = await multipartUploadRecording(
        ctx,
        server,
        client,
        dir,
        recording,
        metadata,
        size,
        strict,
        verbose,
        agentOptions
      );
    } else {
      recordingId = await directUploadRecording(
        ctx,
        server,
        client,
        dir,
        recording,
        metadata,
        size,
        strict,
        verbose
      );
    }
  } catch (err) {
    handleUploadingError(
      ctx,
      err instanceof ProtocolError ? err.protocolMessage : String(err),
      strict,
      verbose,
      err
    );
    return null;
  }

  await pMap(
    recording.sourcemaps,
    async (sourcemap: SourceMapEntry) => {
      try {
        ctx.debug?.("Uploading sourcemap %s for recording %s", sourcemap.path, recording.id);
        const contents = fs.readFileSync(sourcemap.path, "utf8");
        const sourcemapId = await client.connectionUploadSourcemap(
          recordingId,
          sourcemap,
          contents
        );
        await pMap(
          sourcemap.originalSources,
          originalSource => {
            ctx.debug?.(
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
          ctx,
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
    removeRecordingAssets(ctx, recording, { directory: dir });
  }

  addRecordingEvent(ctx, dir, "uploadFinished", recording.id);
  maybeLog(
    ctx,
    verbose,
    `Upload finished! View your Replay at: https://app.replay.io/recording/${recordingId}`
  );
  client.closeConnection();
  return recordingId;
}

async function uploadRecording(id: string, opts: UploadOptions = {}, ctx?: Ctx) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);

  if (!recording) {
    maybeLog(ctx, opts.verbose, `Unknown recording ${id}`);
    return null;
  }

  return doUploadRecording(
    ctx,
    dir,
    server,
    recording,
    opts.verbose,
    opts.apiKey,
    opts.agentOptions,
    true,
    opts.strict
  );
}

async function processUploadedRecording(ctx: Ctx, recordingId: string, opts: Options) {
  const server = getServer(opts);
  const agent = getHttpAgent(server, opts.agentOptions);
  const { verbose } = opts;
  let apiKey = opts.apiKey;

  maybeLog(ctx, verbose, `Processing recording ${recordingId}...`);

  if (!apiKey) {
    apiKey = await readToken(ctx, opts);
  }

  const client = new ReplayClient(ctx);
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    maybeLog(ctx, verbose, `Processing failed: can't connect to server ${server}`);
    return false;
  }

  try {
    const error = await client.connectionWaitForProcessed(recordingId);
    if (error) {
      maybeLog(ctx, verbose, `Processing failed: ${error}`);
      return false;
    }
  } finally {
    client.closeConnection();
  }

  maybeLog(ctx, verbose, "Finished processing.");
  return true;
}

async function processRecording(ctx: Ctx, id: string, opts: Options = {}) {
  const recordingId = await uploadRecording(id, opts, ctx);
  if (!recordingId) {
    return null;
  }
  const succeeded = await processUploadedRecording(ctx, recordingId, opts);
  return succeeded ? recordingId : null;
}

async function uploadAllRecordings(opts: UploadAllOptions = {}, ctx: Partial<Ctx> = {}) {
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
      ctx,
      opts.verbose,
      `\n⚠️ Warning: Some crash reports were created but will not be uploaded because of the provided filter. Add --include-crashes to upload crash reports.\n`
    );
  }

  if (recordings.length === 0) {
    if (opts.filter && allRecordings.length > 0) {
      maybeLog(ctx, opts.verbose, `No replays matched the provided filter`);
    } else {
      maybeLog(ctx, opts.verbose, `No replays were found to upload`);
    }

    return true;
  }

  maybeLog(ctx, opts.verbose, `Starting upload of ${recordings.length} replays`);
  if (opts.batchSize) {
    ctx?.debug?.("Batching upload in groups of %d", opts.batchSize);
  }

  const batchSize = Math.min(opts.batchSize || 20, 25);

  const recordingIds: (string | null)[] = await pMap(
    recordings,
    (r: RecordingEntry) =>
      doUploadRecording(
        ctx,
        dir,
        server,
        r,
        opts.verbose,
        opts.apiKey,
        opts.agentOptions,
        false,
        opts.strict
      ),
    { concurrency: batchSize, stopOnError: false }
  );

  recordingIds.forEach(id => {
    const recording = recordings.find(r => r.id === id);
    if (!recording) return;

    removeRecordingAssets(ctx, recording, opts);
  });

  return recordingIds.every(r => r !== null);
}

async function doViewRecording(
  ctx: Ctx | undefined,
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agentOptions?: AgentOptions,
  viewServer?: string
) {
  let recordingId;
  if (recording.status === "crashUploaded") {
    maybeLog(ctx, verbose, "Crash report already uploaded");
    return true;
  } else if (recording.status == "uploaded") {
    recordingId = recording.recordingId;
    server = recording.server!;
  } else {
    recordingId = await doUploadRecording(
      ctx,
      dir,
      server,
      recording,
      verbose,
      apiKey,
      agentOptions,
      true
    );

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

async function viewRecording(id: string, opts: Options = {}, ctx?: Ctx) {
  let server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);
  if (!recording) {
    maybeLog(ctx, opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  return doViewRecording(ctx, dir, server, recording, opts.verbose, opts.apiKey, opts.agentOptions);
}

async function viewLatestRecording(opts: Options = {}, ctx?: Ctx) {
  let server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  if (!recordings.length) {
    maybeLog(ctx, opts.verbose, "No recordings to view");
    return false;
  }
  return doViewRecording(
    ctx,
    dir,
    server,
    recordings[recordings.length - 1],
    opts.verbose,
    opts.apiKey,
    opts.agentOptions,
    opts.viewServer
  );
}

function maybeRemoveAssetFile(ctx: Partial<Ctx> | undefined, asset?: string) {
  if (asset) {
    try {
      if (fs.existsSync(asset)) {
        ctx?.debug?.("Removing asset file %s", asset);
        fs.unlinkSync(asset);
      }
    } catch (e) {
      ctx?.debug?.("Failed to remove asset file: %s", e);
    }
  }
}

function removeRecording(id: string, opts: Options = {}, ctx?: Ctx) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);
  if (!recording) {
    maybeLog(ctx, opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  removeRecordingAssets(ctx, recording, opts);
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

function removeRecordingAssets(
  ctx: Partial<Ctx> | undefined,
  recording: RecordingEntry,
  opts?: Pick<Options, "directory">
) {
  const localRecordings = listAllRecordings({
    ...opts,
    filter: r => r.status !== "uploaded" && r.status !== "crashUploaded" && r.id !== recording.id,
  });

  const localRecordingAssetFiles = new Set(localRecordings.flatMap(getRecordingAssetFiles));
  const assetFiles = getRecordingAssetFiles(recording);
  assetFiles.forEach(file => {
    if (!localRecordingAssetFiles.has(file)) {
      maybeRemoveAssetFile(ctx, file);
    }
  });
}

function removeAllRecordings(opts: Options = {}, ctx?: Ctx) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  recordings.forEach(r => removeRecordingAssets(ctx, r, opts));

  removeRecordingsFile(dir);
}

function addLocalRecordingMetadata(recordingId: string, metadata: Record<string, unknown>) {
  add(recordingId, metadata);
}

async function updateMetadata(
  {
    init: metadata,
    keys = [],
    filter,
    includeCrashes,
    verbose,
    warn,
    directory,
  }: MetadataOptions & FilterOptions,
  ctx?: Ctx
) {
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
      ctx?.debug("Metadata initialization error: %o", e);
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

  ctx?.debug("Sanitized metadata: %O", sanitized);

  const recordings = listAllRecordings({ directory, filter, includeCrashes });

  recordings.forEach(r => {
    maybeLog(ctx, verbose, `Setting metadata for ${r.id}`);
    add(r.id, sanitized);
  });
}

async function launchBrowser(
  browserName: BrowserName,
  args: string[] = [],
  record: boolean = false,
  opts?: Options & LaunchOptions,
  ctx?: Ctx
) {
  ctx?.debug("launchBrowser: %s %o %s %o", browserName, args, record, opts);
  const execPath = getExecutablePath(ctx, browserName, opts);
  if (!execPath) {
    throw new Error(`${browserName} not supported on the current platform`);
  }

  if (!fs.existsSync(execPath)) {
    maybeLog(ctx, opts?.verbose, `Installing ${browserName}`);
    await ensureBrowsersInstalled(ctx, browserName, false, opts);
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

async function version(ctx?: Ctx) {
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
    ctx?.debug("Error retrieving latest package info: %o", e);
  }

  return {
    version,
    update,
    latest,
  };
}

export {
  ExternalRecordingEntry,
  UnstructuredMetadata,
  addLocalRecordingMetadata,
  ensurePlaywrightBrowsersInstalled,
  ensurePuppeteerBrowsersInstalled,
  exponentialBackoffRetry,
  getDirectory,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
  launchBrowser,
  listAllRecordings,
  processRecording,
  query,
  removeAllRecordings,
  removeRecording,
  updateBrowsers,
  updateMetadata,
  uploadAllRecordings,
  uploadRecording,
  version,
  viewLatestRecording,
  viewRecording,
};
