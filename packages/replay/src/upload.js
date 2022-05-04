const crypto = require("crypto");
const ProtocolClient = require("./client");
const { defer, maybeLog, isValidUUID } = require("./utils");
const { sanitize: sanitizeMetadata } = require("../metadata");

let gClient;
let gClientReady = defer();

async function initConnection(server, accessToken, verbose, agent) {
  if (!gClient) {
    let { resolve } = gClientReady;
    gClient = new ProtocolClient(
      server,
      {
        async onOpen() {
          try {
            await gClient.setAccessToken(accessToken);
            resolve(true);
          } catch (err) {
            maybeLog(verbose, `Error authenticating with server: ${err}`);
            resolve(false);
          }
        },
        onClose() {
          resolve(false);
        },
        onError(e) {
          maybeLog(verbose, `Error connecting to server: ${e}`);
          resolve(false);
        },
      },
      {
        agent,
      }
    );
  }

  return gClientReady.promise;
}

async function connectionCreateRecording(id, buildId) {
  const { recordingId } = await gClient.sendCommand(
    "Internal.createRecording",
    {
      buildId,
      // 3/22/2022: Older builds use integers instead of UUIDs for the recording
      // IDs written to disk. These are not valid to use as recording IDs when
      // uploading recordings to the backend.
      recordingId: isValidUUID(id) ? id : undefined,
      // Ensure that if the upload fails, we will not create
      // partial recordings.
      requireFinish: true,
    }
  );
  return recordingId;
}

function buildRecordingMetadata(metadata) {
  // extract the "standard" metadata and route the `rest` through the sanitizer
  const { duration, url, uri, title, operations, ...rest } = metadata;

  return {
    recordingData: {
      duration: duration || 0,
      url: url || uri || "",
      title: title || "",
      operations: operations || {
        scriptDomains: [],
      },
      id,
      lastScreenData: "",
      lastScreenMimeType: "",
    },
    metadata: sanitizeMetadata(rest),
  };
}

async function setRecordingMetadata(id, metadata) {
  await gClient.sendCommand("Internal.setRecordingMetadata", metadata);
}

function connectionProcessRecording(recordingId) {
  gClient.sendCommand("Recording.processRecording", { recordingId });
}

async function connectionWaitForProcessed(recordingId) {
  const { sessionId } = await gClient.sendCommand("Recording.createSession", {
    recordingId,
  });
  const waiter = defer();

  gClient.setEventListener("Recording.sessionError", ({ message }) =>
    waiter.resolve(`session error ${sessionId}: ${message}`)
  );

  gClient.setEventListener("Session.unprocessedRegions", () => {});

  gClient
    .sendCommand("Session.ensureProcessed", { level: "basic" }, null, sessionId)
    .then(() => waiter.resolve(null));

  const error = await waiter.promise;
  return error;
}

async function connectionReportCrash(data) {
  await gClient.sendCommand("Internal.reportCrash", { data });
}

// Granularity for splitting up a recording into chunks for uploading.
const ChunkGranularity = 1024 * 1024;

async function connectionUploadRecording(recordingId, contents) {
  const promises = [];
  for (let i = 0; i < contents.length; i += ChunkGranularity) {
    const buf = contents.subarray(i, i + ChunkGranularity);
    promises.push(
      gClient.sendCommand(
        "Internal.addRecordingData",
        { recordingId, offset: i, length: buf.length },
        buf
      )
    );
  }
  // Explicitly mark the recording complete so the server knows that it has
  // been sent all of the recording data, and can save the recording.
  // This means if someone presses Ctrl+C, the server doesn't save a
  // partial recording.
  promises.push(
    gClient.sendCommand("Internal.finishRecording", { recordingId })
  );
  return Promise.all(promises);
}

async function connectionUploadSourcemap(recordingId, metadata, content) {
  const hash = "sha256:" + sha256(content);
  const { token } = await gClient.sendCommand("Resource.token", { hash });
  let resource = {
    token,
    saltedHash: "sha256:" + sha256(token + content),
  };

  const { exists } = await gClient.sendCommand("Resource.exists", { resource });
  if (!exists) {
    ({ resource } = await gClient.sendCommand("Resource.create", { content }));
  }

  const { baseURL, targetContentHash, targetURLHash, targetMapURLHash } =
    metadata;
  const result = await gClient.sendCommand("Recording.addSourceMap", {
    recordingId,
    resource,
    baseURL,
    targetContentHash,
    targetURLHash,
    targetMapURLHash,
  });
  return result.id;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function closeConnection() {
  if (gClient) {
    gClient.close();
    gClient = undefined;
    gClientReady = defer();
  }
}

module.exports = {
  initConnection,
  connectionCreateRecording,
  connectionProcessRecording,
  connectionWaitForProcessed,
  connectionUploadRecording,
  connectionUploadSourcemap,
  connectionReportCrash,
  closeConnection,
  setRecordingMetadata,
  buildRecordingMetadata,
};
