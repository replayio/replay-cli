import fs from "fs";
import path from "path";
import { Worker } from "worker_threads";
import crypto from "crypto";
import ProtocolClient from "./client";
import {
  defer,
  maybeLog,
  isValidUUID,
  exponentialBackoffRetry,
  getUserAgent,
  concurrentWithRetry,
} from "./utils";
import { sanitize as sanitizeMetadata } from "../metadata";
import { Options, OriginalSourceEntry, RecordingMetadata, SourceMapEntry } from "./types";
import dbg from "./debug";

const debug = dbg("replay:cli:upload");

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

  async connectionBeginRecordingUpload(
    id: string,
    buildId: string,
    size: number,
    multiPartChunkSize: number
  ) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    const { recordingId, uploadLink, uploadId, partLinks } = await this.client.sendCommand<{
      recordingId: string;
      uploadLink: string;
      uploadId: string;
      partLinks: string[];
      multiPartChunkSize: number;
    }>("Internal.beginRecordingUpload", {
      buildId,
      // 3/22/2022: Older builds use integers instead of UUIDs for the recording
      // IDs written to disk. These are not valid to use as recording IDs when
      // uploading recordings to the backend.
      recordingId: isValidUUID(id) ? id : undefined,
      recordingSize: size,
      multiPartChunkSize,
    });
    return { recordingId, uploadLink, uploadId, partLinks };
  }

  async buildRecordingMetadata(
    metadata: Record<string, unknown>,
    _opts: Options = {}
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

  async uploadRecording(path: string, uploadLink: string, size: number) {
    const file = fs.createReadStream(path);
    const resp = await fetch(uploadLink, {
      method: "PUT",
      headers: { "Content-Length": size.toString(), "User-Agent": getUserAgent() },
      body: file,
    });

    if (resp.status !== 200) {
      debug(await resp.text());
      throw new Error(`Failed to upload recording. Response was ${resp.status} ${resp.statusText}`);
    }
  }

  async uploadPart(link: string, part: any, size: number): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log("Stating worker");
      const worker = new Worker(path.join(__dirname, "./uploadWorker.js"));

      worker.on("message", resolve);
      worker.on("error", reject);
      worker.on("exit", code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      worker.postMessage({ link, part, size });
    });
  }

  async uploadRecordingInParts(path: string, partUploadLinks: string[], partSize: number) {
    const fileBuffer = fs.readFileSync(path);
    const tasks = partUploadLinks.map((url, index) => async () => {
      const partNumber = index + 1;
      const start = index * partSize;
      const end = Math.min(start + partSize, fileBuffer.length);
      const partData = fileBuffer.slice(start, end);

      debug(`Uploading part`, partNumber);
      return this.uploadPart(url, partData, partData.length);
    });

    const results = await concurrentWithRetry(tasks, 4);

    return results;
  }

  async connectionEndRecordingUpload(recordingId: string, uploadId?: string, eTags?: string[]) {
    if (!this.client) throw new Error("Protocol client is not initialized");

    await this.client.sendCommand<{ recordingId: string; uploadId: string; partETags: string[] }>(
      "Internal.endRecordingUpload",
      {
        recordingId,
        uploadId,
        partETags: eTags,
      }
    );
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
