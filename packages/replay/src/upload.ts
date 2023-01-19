import fs from "fs";
import crypto from "crypto";
import dbg from "debug";
import ProtocolClient from "./client";
import { defer, maybeLog, isValidUUID } from "./utils";
import { sanitize as sanitizeMetadata } from "../metadata";
import { Options, OriginalSourceEntry, RecordingMetadata, SourceMapEntry } from "./types";

const debug = dbg("replay:cli:upload");

// Granularity for splitting up a recording into chunks for uploading.
const ChunkGranularity = 1024 * 1024;

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

class ReplayClient {
  client: ProtocolClient | undefined;
  clientReady = defer<boolean>();

  async initConnection(server: string, accessToken?: string, verbose?: boolean, agent?: any) {
    if (!this.client) {
      let { resolve } = this.clientReady;
      this.client = new ProtocolClient(
        server,
        {
          onOpen: async () => {
            try {
              await this.client!.setAccessToken(accessToken);
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

    return this.clientReady.promise;
  }

  async connectionCreateRecording(id: string, buildId: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const { recordingId } = await this.client.sendCommand<{ recordingId: string }>(
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

  async buildRecordingMetadata(
    metadata: Record<string, unknown>,
    opts: Options = {}
  ): Promise<RecordingMetadata> {
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
      metadata: await sanitizeMetadata(rest),
    };
  }

  async setRecordingMetadata(id: string, metadata: RecordingMetadata) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    metadata.recordingData.id = id;
    await this.client.sendCommand("Internal.setRecordingMetadata", metadata);
  }

  connectionProcessRecording(recordingId: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    this.client.sendCommand("Recording.processRecording", { recordingId });
  }

  async connectionWaitForProcessed(recordingId: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const { sessionId } = await this.client.sendCommand<{ sessionId: string }>(
      "Recording.createSession",
      {
        recordingId,
      }
    );
    const waiter = defer();

    this.client.setEventListener("Recording.sessionError", ({ message }) =>
      waiter.resolve(`session error ${sessionId}: ${message}`)
    );

    this.client.setEventListener("Session.unprocessedRegions", () => {});

    this.client
      .sendCommand("Session.ensureProcessed", { level: "basic" }, null, sessionId)
      .then(() => waiter.resolve(null));

    const error = await waiter.promise;
    return error;
  }

  async connectionReportCrash(data: any) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    await this.client.sendCommand("Internal.reportCrash", { data });
  }

  async connectionUploadRecording(recordingId: string, path: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const file = fs.createReadStream(path);

    let buffer: Buffer | undefined;
    let offset = 0;

    debug("%s: Replay file size: %d bytes", recordingId, fs.statSync(path).size);

    const send = async (b: Buffer) => {
      const length = b.length;
      debug("%s: Sending %d bytes at offset %d", recordingId, length, offset);

      await new Promise<void>((resolve, reject) =>
        this.client?.sendCommand(
          "Internal.addRecordingData",
          { recordingId, offset, length },
          b,
          undefined,
          err => (err ? reject(err) : resolve())
        )
      );

      offset += length;
    };

    for await (const chunk of file) {
      const cb = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
      debug("%s: Read %d bytes from file", recordingId, cb.length);

      buffer = buffer ? Buffer.concat([buffer, cb]) : cb;

      if (buffer.length >= ChunkGranularity) {
        const data = buffer.subarray(0, ChunkGranularity);
        buffer = buffer.subarray(ChunkGranularity);
        await send(data);
      }
    }

    if (buffer?.length) {
      await send(buffer);
    }

    debug("%s: Uploaded %d bytes", recordingId, offset);

    // Explicitly mark the recording complete so the server knows that it has
    // been sent all of the recording data, and can save the recording.
    // This means if someone presses Ctrl+C, the server doesn't save a
    // partial recording.
    await this.client.sendCommand("Internal.finishRecording", { recordingId });
  }

  async connectionUploadSourcemap(recordingId: string, metadata: SourceMapEntry, content: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const resource = await this.createResource(content);

    const { baseURL, targetContentHash, targetURLHash, targetMapURLHash } = metadata;
    const result = await this.client.sendCommand<{ id: string }>("Recording.addSourceMap", {
      recordingId,
      resource,
      baseURL,
      targetContentHash,
      targetURLHash,
      targetMapURLHash,
    });
    return result.id;
  }

  async connectionUploadOriginalSource(
    recordingId: string,
    parentId: string,
    metadata: OriginalSourceEntry,
    content: string
  ) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const resource = await this.createResource(content);

    const { parentOffset } = metadata;
    await this.client.sendCommand("Recording.addOriginalSource", {
      recordingId,
      resource,
      parentId,
      parentOffset,
    });
  }

  async createResource(content: string) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const hash = "sha256:" + sha256(content);
    const { token } = await this.client.sendCommand<{ token: string }>("Resource.token", { hash });
    let resource = {
      token,
      saltedHash: "sha256:" + sha256(token + content),
    };

    const { exists } = await this.client.sendCommand<{ exists: boolean }>("Resource.exists", {
      resource,
    });
    if (!exists) {
      ({ resource } = await this.client.sendCommand("Resource.create", { content }));
    }

    return resource;
  }

  closeConnection() {
    if (this.client) {
      this.client.close();
      this.client = undefined;
      this.clientReady = defer();
    }
  }
}

export { ReplayClient };
