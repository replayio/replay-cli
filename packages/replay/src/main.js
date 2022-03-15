const fs = require("fs");
const path = require("path");
const {
  initConnection,
  connectionCreateRecording,
  connectionProcessRecording,
  connectionWaitForProcessed,
  connectionUploadRecording,
  connectionReportCrash,
  closeConnection,
  setRecordingMetadata,
} = require("./upload");
const {
  ensurePuppeteerBrowsersInstalled,
  ensurePlaywrightBrowsersInstalled,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
  updateBrowsers,
} = require("./install");
const { getDirectory, maybeLog } = require("./utils");
const { spawn } = require("child_process");

function getRecordingsFile(dir) {
  return path.join(dir, "recordings.log");
}

function readRecordingFile(dir) {
  const file = getRecordingsFile(dir);
  if (!fs.existsSync(file)) {
    return [];
  }

  return fs.readFileSync(file, "utf8").split("\n");
}

function writeRecordingFile(dir, lines) {
  // Add a trailing newline so the driver can safely append logs
  fs.writeFileSync(getRecordingsFile(dir), lines.join("\n") + "\n");
}

function getBuildRuntime(buildId) {
  const match = /.*?-(.*?)-/.exec(buildId);
  return match ? match[1] : "unknown";
}

function generateDefaultTitle(metadata) {
  if (metadata.uri) {
    let host = metadata.uri;
    try {
      const url = new URL(metadata.uri);
      host = url.host;
    } finally {
      return `Replay of ${host}`;
    }
  }

  if (Array.isArray(metadata.argv) && typeof metadata.argv[0] === "string") {
    return `Replay of ${path.basename(metadata.argv[0])}`;
  }
}

function readRecordings(dir, includeHidden) {
  const recordings = [];
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
          createTime: new Date(timestamp).toString(),
          buildId,
          runtime: getBuildRuntime(buildId),
          metadata: {},

          // We use an unknown status after the createRecording event because
          // there should always be later events describing what happened to the
          // recording.
          status: "unknown",
        });
        break;
      }
      case "addMetadata": {
        const { id, metadata } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          Object.assign(
            recording.metadata,
            { title: generateDefaultTitle(metadata) },
            metadata
          );
        }
        break;
      }
      case "writeStarted": {
        const { id, path } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "startedWrite");
          recording.path = path;
        }
        break;
      }
      case "writeFinished": {
        const { id } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "onDisk");
        }
        break;
      }
      case "uploadStarted": {
        const { id, server, recordingId } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "startedUpload");
          recording.server = server;
          recording.recordingId = recordingId;
        }
        break;
      }
      case "uploadFinished": {
        const { id } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "uploaded");
        }
        break;
      }
      case "recordingUnusable": {
        const { id, reason } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "unusable");
          recording.unusableReason = reason;
        }
        break;
      }
      case "crashed": {
        const { id } = obj;
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "crashed");
        }
        break;
      }
      case "crashData": {
        const { id, data } = obj;
        const recording = recordings.find((r) => r.id == id);
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
        const recording = recordings.find((r) => r.id == id);
        if (recording) {
          updateStatus(recording, "crashUploaded");
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
  return recordings.filter(
    (r) => !(r.unusableReason || "").includes("No interesting content")
  );
}

function updateStatus(recording, status) {
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

// Convert a recording into a format for listing.
function listRecording(recording) {
  // Remove properties we only use internally.
  return { ...recording, buildId: undefined, crashData: undefined };
}

function listAllRecordings(opts = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  return recordings.map(listRecording);
}

function uploadSkipReason(recording) {
  // Status values where there is something worth uploading.
  const canUploadStatus = [
    "onDisk",
    "startedWrite",
    "startedUpload",
    "crashed",
  ];
  if (!canUploadStatus.includes(recording.status)) {
    return `wrong recording status ${recording.status}`;
  }
  if (!recording.path && recording.status != "crashed") {
    return "recording not saved to disk";
  }
  return null;
}

function getServer(opts) {
  return (
    opts.server ||
    process.env.RECORD_REPLAY_SERVER ||
    "wss://dispatch.replay.io"
  );
}

function addRecordingEvent(dir, kind, id, tags = {}) {
  const lines = readRecordingFile(dir);
  lines.push(
    JSON.stringify({
      kind,
      id,
      timestamp: Date.now(),
      ...tags,
    })
  );
  writeRecordingFile(dir, lines);
}

async function doUploadCrash(dir, server, recording, verbose, apiKey, agent) {
  maybeLog(verbose, `Starting crash data upload for ${recording.id}...`);
  if (!(await initConnection(server, apiKey, verbose, agent))) {
    maybeLog(
      verbose,
      `Crash data upload failed: can't connect to server ${server}`
    );
    return null;
  }
  await Promise.all(
    (recording.crashData || []).map(async (data) => {
      await connectionReportCrash(data);
    })
  );
  addRecordingEvent(dir, "crashUploaded", recording.id, { server });
  maybeLog(verbose, `Crash data upload finished.`);
  closeConnection();
}

async function doUploadRecording(
  dir,
  server,
  recording,
  verbose,
  apiKey,
  agent
) {
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
  if (recording.status == "crashed") {
    await doUploadCrash(dir, server, recording, verbose, apiKey, agent);
    maybeLog(verbose, `Upload failed: crashed while recording`);
    return null;
  }
  let contents;
  try {
    contents = fs.readFileSync(recording.path);
  } catch (e) {
    maybeLog(verbose, `Upload failed: can't read recording from disk: ${e}`);
    return null;
  }
  if (!(await initConnection(server, apiKey, verbose, agent))) {
    maybeLog(verbose, `Upload failed: can't connect to server ${server}`);
    return null;
  }
  const recordingId = await connectionCreateRecording(recording.buildId);
  maybeLog(verbose, `Created remote recording ${recordingId}, uploading...`);
  if (recording.metadata) {
    maybeLog(verbose, `Setting recording metadata for ${recordingId}`);
    await setRecordingMetadata(recordingId, recording.metadata);
  }
  addRecordingEvent(dir, "uploadStarted", recording.id, {
    server,
    recordingId,
  });
  connectionProcessRecording(recordingId);
  await connectionUploadRecording(recordingId, contents);
  addRecordingEvent(dir, "uploadFinished", recording.id);
  maybeLog(verbose, "Upload finished.");
  closeConnection();
  return recordingId;
}

async function uploadRecording(id, opts = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find((r) => r.id == id);
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
    opts.agent
  );
}

async function processUploadedRecording(recordingId, opts) {
  const server = getServer(opts);
  const { apiKey, verbose, agent } = opts;

  maybeLog(verbose, `Processing recording ${recordingId}...`);

  if (!(await initConnection(server, apiKey, verbose, agent))) {
    maybeLog(verbose, `Processing failed: can't connect to server ${server}`);
    return false;
  }

  try {
    const error = await connectionWaitForProcessed(recordingId);
    if (error) {
      maybeLog(verbose, `Processing failed: ${error}`);
      return false;
    }
  } finally {
    closeConnection();
  }

  maybeLog(verbose, "Finished processing.");
  return true;
}

async function processRecording(id, opts = {}) {
  const recordingId = await uploadRecording(id, opts);
  if (!recordingId) {
    return null;
  }
  const succeeded = await processUploadedRecording(recordingId, opts);
  return succeeded ? recordingId : null;
}

async function uploadAllRecordings(opts = {}) {
  const server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  let uploadedAll = true;
  for (const recording of recordings) {
    if (!uploadSkipReason(recording)) {
      if (
        !(await doUploadRecording(
          dir,
          server,
          recording,
          opts.verbose,
          opts.apiKey,
          opts.agent
        ))
      ) {
        uploadedAll = false;
      }
    }
  }
  return uploadedAll;
}

// Get the executable name to use when opening a URL.
// It would be nice to use an existing npm package for this,
// but the obvious choice of "open" didn't actually work on linux
// when testing...
function openExecutable() {
  switch (process.platform) {
    case "darwin":
      return "open";
    case "linux":
      return "xdg-open";
    default:
      throw new Error("Unsupported platform");
  }
}

async function doViewRecording(dir, server, recording, verbose, apiKey, agent) {
  let recordingId;
  if (recording.status == "uploaded") {
    recordingId = recording.recordingId;
    server = recording.server;
  } else {
    recordingId = await doUploadRecording(
      dir,
      server,
      recording,
      verbose,
      apiKey,
      agent
    );
    if (!recordingId) {
      return false;
    }
  }
  const dispatch =
    server != "wss://dispatch.replay.io" ? `&dispatch=${server}` : "";
  spawn(openExecutable(), [
    `https://app.replay.io?id=${recordingId}${dispatch}`,
  ]);
  return true;
}

async function viewRecording(id, opts = {}) {
  let server = getServer(opts);
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir);
  const recording = recordings.find((r) => r.id == id);
  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  return doViewRecording(
    dir,
    server,
    recording,
    opts.verbose,
    opts.apiKey,
    opts.agent
  );
}

async function viewLatestRecording(opts = {}) {
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

function maybeRemoveRecordingFile(recording) {
  if (recording.path) {
    try {
      fs.unlinkSync(recording.path);
    } catch (e) {}
  }
}

function removeRecording(id, opts = {}) {
  const dir = getDirectory(opts);
  const recordings = readRecordings(dir, includeHidden);
  const recording = recordings.find((r) => r.id == id);
  if (!recording) {
    maybeLog(opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  maybeRemoveRecordingFile(recording);

  const lines = readRecordingFile(dir).filter((line) => {
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

module.exports = {
  listAllRecordings,
  uploadRecording,
  processRecording,
  uploadAllRecordings,
  viewRecording,
  viewLatestRecording,
  removeRecording,
  removeAllRecordings,
  updateBrowsers,

  // These methods aren't documented or available via the CLI, and are used by other
  // @recordreplay NPM packages.
  ensurePlaywrightBrowsersInstalled,
  ensurePuppeteerBrowsersInstalled,
  getPlaywrightBrowserPath,
  getPuppeteerBrowserPath,
};
