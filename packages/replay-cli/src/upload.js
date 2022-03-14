const ProtocolClient = require("./client");
const { defer, maybeLog } = require("./utils");

let gClient;

async function initConnection(server, accessToken, verbose) {
  if (!gClient) {
    const { promise, resolve } = defer();
    gClient = new ProtocolClient(server, {
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
    });
    return promise;
  }
  return true;
}

async function connectionCreateRecording(buildId) {
  const { recordingId } = await gClient.sendCommand(
    "Internal.createRecording",
    {
      buildId,
      // Ensure that if the upload fails, we will not create
      // partial recordings.
      requireFinish: true,
    }
  );
  return recordingId;
}

async function setRecordingMetadata(id, metadata) {
  await gClient.sendCommand("Internal.setRecordingMetadata", {
    recordingData: {
      duration: metadata.duration || 0,
      url: metadata.url || "",
      title: metadata.title || "",
      operations: metadata.operations || {
        scriptDomains: [],
      },
      id,
      lastScreenData: "",
      lastScreenMimeType: "",
    },
  });
}

function connectionProcessRecording(recordingId) {
  gClient.sendCommand("Recording.processRecording", { recordingId });
}

async function connectionWaitForProcessed(recordingId) {
  const { sessionId } = await gClient.sendCommand("Recording.createSession", { recordingId });
  const waiter = defer();

  gClient.setEventListener(
    "Recording.sessionError",
    ({ message }) => waiter.resolve(`session error ${sessionId}: ${message}`)
  );

  gClient.setEventListener("Session.unprocessedRegions", () => {});

  gClient.sendCommand(
    "Session.ensureProcessed",
    { level: "basic" },
    null,
    sessionId
  ).then(() => waiter.resolve(null));

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

function closeConnection() {
  if (gClient) {
    gClient.close();
    gClient = undefined;
  }
}

module.exports = {
  initConnection,
  connectionCreateRecording,
  connectionProcessRecording,
  connectionWaitForProcessed,
  connectionUploadRecording,
  connectionReportCrash,
  closeConnection,
  setRecordingMetadata,
};
