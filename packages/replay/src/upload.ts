import crypto from "crypto";
import ProtocolClient from "./client";
import { defer, maybeLog, isValidUUID } from "./utils";
import { sanitize as sanitizeMetadata } from "../metadata";
import { Options, OriginalSourceEntry, RecordingMetadata, SourceMapEntry } from "./types";

let gClient: ProtocolClient | undefined;
let gClientReady = defer<boolean>();

async function initConnection(
  server: string,
  accessToken?: string,
  verbose?: boolean,
  agent?: any
) {
  if (!gClient) {
    let { resolve } = gClientReady;
    gClient = new ProtocolClient(
      server,
      {
        async onOpen() {
          try {
            await gClient!.setAccessToken(accessToken);
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

async function connectionCreateRecording(id: string, buildId: string) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  const { recordingId } = await gClient.sendCommand<{ recordingId: string }>(
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

function buildRecordingMetadata(metadata: Record<string, unknown>, opts: Options = {}) {
  // extract the "standard" metadata and route the `rest` through the sanitizer
  const { duration, url, uri, title, operations, ...rest } = metadata;

  const metadataUrl = url || uri;

  return {
    recordingData: {
      duration: typeof duration === "number" ? duration : 0,
      url: typeof metadataUrl === "string" ? metadataUrl : "",
      title: typeof title === "string" ? title : "",
      operations:
        operations && typeof operations === "object"
          ? operations
          : {
              scriptDomains: [],
            },
      lastScreenData: "",
      lastScreenMimeType: "",
    },
    metadata: sanitizeMetadata(rest),
  };
}

async function setRecordingMetadata(id: string, metadata: RecordingMetadata) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  metadata.recordingData.id = id;
  await gClient.sendCommand("Internal.setRecordingMetadata", metadata);
}

function connectionProcessRecording(recordingId: string) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  gClient.sendCommand("Recording.processRecording", { recordingId });
}

async function connectionWaitForProcessed(recordingId: string) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  const { sessionId } = await gClient.sendCommand<{ sessionId: string }>(
    "Recording.createSession",
    {
      recordingId,
    }
  );
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

async function connectionReportCrash(data: any) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  await gClient.sendCommand("Internal.reportCrash", { data });
}

// Granularity for splitting up a recording into chunks for uploading.
const ChunkGranularity = 1024 * 1024;

async function connectionUploadRecording(recordingId: string, contents: Buffer) {
  if (!gClient) throw new Error("Protocol client is not initialized");

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
  promises.push(gClient.sendCommand("Internal.finishRecording", { recordingId }));
  return Promise.all(promises);
}

async function connectionUploadSourcemap(
  recordingId: string,
  metadata: SourceMapEntry,
  content: string
) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  const resource = await createResource(content);

  const { baseURL, targetContentHash, targetURLHash, targetMapURLHash } = metadata;
  const result = await gClient.sendCommand<{ id: string }>("Recording.addSourceMap", {
    recordingId,
    resource,
    baseURL,
    targetContentHash,
    targetURLHash,
    targetMapURLHash,
  });
  return result.id;
}

async function connectionUploadOriginalSource(
  recordingId: string,
  parentId: string,
  metadata: OriginalSourceEntry,
  content: string
) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  const resource = await createResource(content);

  const { parentOffset } = metadata;
  await gClient.sendCommand("Recording.addOriginalSource", {
    recordingId,
    resource,
    parentId,
    parentOffset,
  });
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function createResource(content: string) {
  if (!gClient) throw new Error("Protocol client is not initialized");

  const hash = "sha256:" + sha256(content);
  const { token } = await gClient.sendCommand<{ token: string }>("Resource.token", { hash });
  let resource = {
    token,
    saltedHash: "sha256:" + sha256(token + content),
  };

  const { exists } = await gClient.sendCommand<{ exists: boolean }>("Resource.exists", {
    resource,
  });
  if (!exists) {
    ({ resource } = await gClient.sendCommand("Resource.create", { content }));
  }

  return resource;
}

function closeConnection() {
  if (gClient) {
    gClient.close();
    gClient = undefined;
    gClientReady = defer();
  }
}

export {
  initConnection,
  connectionCreateRecording,
  connectionProcessRecording,
  connectionWaitForProcessed,
  connectionUploadRecording,
  connectionUploadSourcemap,
  connectionUploadOriginalSource,
  connectionReportCrash,
  closeConnection,
  setRecordingMetadata,
  buildRecordingMetadata,
};
