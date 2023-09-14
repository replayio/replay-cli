import dbg from "debug";
import fs from "fs";
import path from "path";

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
  ListOptions,
  MetadataOptions,
  Options,
  RecordingEntry,
  SourceMapEntry,
  UploadOptions,
} from "./types";
import { add, sanitize, source as sourceMetadata, test as testMetadata } from "../metadata";
import { generateDefaultTitle } from "./generateDefaultTitle";
import jsonata from "jsonata";
import { readToken } from "./auth";
export type { BrowserName } from "./types";

const debug = dbg("replay:cli");

function getRecordingsFile(dir: string) {
  return path.join(dir, "recordings.log");
}

function readRecordingFile(dir: string) {
  const file = getRecordingsFile(dir);
  if (!fs.existsSync(file)) {
    return [];
  }

  return fs.readFileSync(file, "utf8").split("\n");
}

function writeRecordingFile(dir: string, lines: string[]) {
  // Add a trailing newline so the driver can safely append logs
  fs.writeFileSync(getRecordingsFile(dir), lines.join("\n") + "\n");
}

function getBuildRuntime(buildId: string) {
  const match = /.*?-(.*?)-/.exec(buildId);
  return match ? match[1] : "unknown";
}

function readRecordings(dir: string, includeHidden = false) {
  const recordings: RecordingEntry[] = [];
  const lines = readRecordingFile(dir);
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      // Ignore lines that aren't valid JSON.
      continue;
    }

    switch (obj.kind) {
      case "createRecording": {
        const { id, timestamp, buildId } = obj;
        recordings.push({
          id,
          createTime: new Date(timestamp),
          buildId,
          runtime: getBuildRuntime(buildId),
          metadata: {},
          sourcemaps: [],

          // We use an unknown status after the createRecording event because
          // there should always be later events describing what happened to the
          // recording.
          status: "unknown",
        });
        break;
      }
      case "addMetadata": {
        const { id, metadata } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          Object.assign(recording.metadata, metadata);

          if (!recording.metadata.title) {
            recording.metadata.title = generateDefaultTitle(recording.metadata);
          }
        }
        break;
      }
      case "writeStarted": {
        const { id, path } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "startedWrite");
          recording.path = path;
        }
        break;
      }
      case "writeFinished": {
        const { id } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "onDisk");
        }
        break;
      }
      case "uploadStarted": {
        const { id, server, recordingId } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "startedUpload");
          recording.server = server;
          recording.recordingId = recordingId;
        }
        break;
      }
      case "uploadFinished": {
        const { id } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "uploaded");
        }
        break;
      }
      case "recordingUnusable": {
        const { id, reason } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "unusable");
          recording.unusableReason = reason;
        }
        break;
      }
      case "crashed": {
        const { id } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "crashed");
        }
        break;
      }
      case "crashData": {
        const { id, data } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          if (!recording.crashData) {
            recording.crashData = [];
          }
          recording.crashData.push(data);
        }
        break;
      }
      case "crashUploaded": {
        const { id } = obj;
        const recording = recordings.find(r => r.id == id);
        if (recording) {
          updateStatus(recording, "crashUploaded");
        }
        break;
      }
      case "sourcemapAdded": {
        const {
          id,
          recordingId,
          path,
          baseURL,
          targetContentHash,
          targetURLHash,
          targetMapURLHash,
        } = obj;
        const recording = recordings.find(r => r.id == recordingId);
        if (recording) {
          recording.sourcemaps.push({
            id,
            path,
            baseURL,
            targetContentHash,
            targetURLHash,
            targetMapURLHash,
            originalSources: [],
          });
        }
        break;
      }
      case "originalSourceAdded": {
        const { recordingId, path, parentId, parentOffset } = obj;
        const recording = recordings.find(r => r.id === recordingId);
        if (recording) {
          const sourcemap = recording.sourcemaps.find(s => s.id === parentId);
          if (sourcemap) {
            sourcemap.originalSources.push({
              path,
              parentOffset,
            });
          }
        }
        break;
      }
    }
  }

  if (includeHidden) {
    return recordings;
  }

  // There can be a fair number of recordings from gecko/chromium content
  // processes which never loaded any interesting content. These are ignored by
  // most callers. Note that we're unable to avoid generating these entries in
  // the first place because the recordings log is append-only and we don't know
  // when a recording process starts if it will ever do anything interesting.
  return recordings.filter(r => !(r.unusableReason || "").includes("No interesting content"));
}

function updateStatus(recording: RecordingEntry, status: RecordingEntry["status"]) {
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

function filterRecordings(recordings: RecordingEntry[], filter?: string) {
  debug("Recording log contains %d replays", recordings.length);
  if (filter) {
    debug("Using filter: %s", filter);
    const exp = jsonata(`$filter($, ${filter})[]`);
    recordings = exp.evaluate(recordings) || [];

    debug("Filtering resulted in %d replays", recordings.length);
  }

  return recordings;
}

// Convert a recording into a format for listing.
function listRecording(recording: RecordingEntry): ExternalRecordingEntry {
  // Remove properties we only use internally.
  const { buildId, crashData, ...recordingWithoutInternalProperties } = recording;
  return recordingWithoutInternalProperties;
}

function listAllRecordings(opts: Options & ListOptions = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);

  if (opts.all) {
    return filterRecordings(recordings, opts.filter).map(listRecording);
  }

  const uploadableRecordings = recordings.filter(recording =>
    ["onDisk", "startedWrite", "crashed"].includes(recording.status)
  );
  return filterRecordings(uploadableRecordings, opts.filter).map(listRecording);
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
  return opts.server || process.env.RECORD_REPLAY_SERVER || "wss://dispatch.replay.io";
}

function addRecordingEvent(dir: string, kind: string, id: string, tags = {}) {
  const event = {
    kind,
    id,
    timestamp: Date.now(),
    ...tags,
  };
  debug("Writing event to recording log %o", event);
  const lines = readRecordingFile(dir);
  lines.push(JSON.stringify(event));
  writeRecordingFile(dir, lines);
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

async function doUploadRecording(
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: any
) {
  debug("Uploading %s from %s to %s", recording.id, dir, server);
  maybeLog(verbose, `Starting upload for ${recording.id}...`);

  if (recording.status == "uploaded" && recording.recordingId) {
    maybeLog(verbose, `Already uploaded: ${recording.recordingId}`);

    return recording.recordingId;
  }

  const reason = uploadSkipReason(recording);
  if (reason) {
    maybeLog(verbose, `Upload failed: ${reason}`);

    return null;
  }

  if (!apiKey) {
    apiKey = await readToken({ directory: dir });
  }

  if (recording.status == "crashed") {
    debug("Uploading crash %o", recording);
    await doUploadCrash(dir, server, recording, verbose, apiKey, agent);
    maybeLog(verbose, `Crash uploaded: crashed while recording`);
    maybeLog(verbose, `Recording upload failed: crashed while recording`);
    return recording.id;
  }

  const { size } = await fs.promises.stat(recording.path!);

  debug("Uploading recording %o", recording);
  const client = new ReplayClient();
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    maybeLog(verbose, `Upload failed: can't connect to server ${server}`);

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
      console.warn("Failed to set recording metadata");
      console.warn(e);
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
        maybeLog(verbose, `can't upload sourcemap ${sourcemap.path} from disk: ${e}`);
      }
    },
    { concurrency: 10, stopOnError: false }
  );

  addRecordingEvent(dir, "uploadFinished", recording.id);
  maybeLog(
    verbose,
    `Upload finished! View your Replay at: https://app.replay.io/recording/${recordingId}`
  );
  client.closeConnection();
  return recordingId;
}

async function uploadRecording(id: string, opts: Options = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find(r => r.id == id);

  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return null;
  }

  return doUploadRecording(dir, server, recording, opts.verbose, opts.apiKey, opts.agent);
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

async function uploadAllRecordings(opts: Options & UploadOptions = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const allRecordings = readRecordings(dir).filter(r => !uploadSkipReason(r));
  const recordings = filterRecordings(allRecordings, opts.filter);

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
    (r: RecordingEntry) => doUploadRecording(dir, server, r, opts.verbose, opts.apiKey, opts.agent),
    { concurrency: batchSize, stopOnError: false }
  );

  return recordingIds.every(r => r !== null);
}

async function doViewRecording(
  dir: string,
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: any
) {
  let recordingId;
  if (recording.status === "crashUploaded") {
    maybeLog(verbose, "Crash report already uploaded");
    return true;
  } else if (recording.status == "uploaded") {
    recordingId = recording.recordingId;
    server = recording.server!;
  } else {
    recordingId = await doUploadRecording(dir, server, recording, verbose, apiKey, agent);

    if (!recordingId) {
      return false;
    } else if (recording.status === "crashed") {
      return true;
    }
  }

  const dispatch = server != "wss://dispatch.replay.io" ? `&dispatch=${server}` : "";
  spawn(openExecutable(), [`https://app.replay.io?id=${recordingId}${dispatch}`]);
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
    opts.agent
  );
}

function maybeRemoveRecordingFile(recording: RecordingEntry) {
  if (recording.path) {
    try {
      fs.unlinkSync(recording.path);
    } catch (e) { }
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
  maybeRemoveRecordingFile(recording);

  const lines = readRecordingFile(dir).filter(line => {
    try {
      const obj = JSON.parse(line);
      if (obj.id == id) {
        return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  });

  writeRecordingFile(dir, lines);
  return true;
}

function removeAllRecordings(opts = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  recordings.forEach(maybeRemoveRecordingFile);

  const file = getRecordingsFile(dir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

function addLocalRecordingMetadata(recordingId: string, metadata: Record<string, unknown>) {
  add(recordingId, metadata);
}

async function updateMetadata({
  init: metadata,
  keys = [],
  filter,
  verbose,
  warn,
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

    maybeLog(verbose, "Metadata:");
    maybeLog(verbose, JSON.stringify(sanitized, undefined, 2));

    const recordings = filterRecordings(listAllRecordings(), filter);

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

async function launchBrowser(browserName: BrowserName, attach: boolean = false, args: string[] = []) {
  const execPath = getExecutablePath(browserName);
  if (!execPath) {
    throw new Error(`${browserName} not supported on the current platform`);
  }

  await ensureBrowsersInstalled(browserName, false);

  const profileDir = path.join(getDirectory(), "runtimes", "profiles", browserName);

  const browserArgs: Record<BrowserName, string[]> = {
    chromium: [
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      ...args,
    ],
    firefox: ["-foreground", ...args],
  };

  const proc = spawn(execPath, browserArgs[browserName], { detached: !attach });
  proc.unref();

  return proc;
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
  // These methods aren't documented or available via the CLI, and are used by other
  // replay NPM packages.
  ensurePlaywrightBrowsersInstalled,
  ensurePuppeteerBrowsersInstalled,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
};
