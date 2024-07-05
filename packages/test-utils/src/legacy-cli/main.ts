import { retryWithExponentialBackoff } from "@replay-cli/shared/async/retryOnFailure";
import fs from "fs";
import { getHttpAgent } from "./utils";
import assert from "node:assert/strict";

// requiring v4 explicitly because it's the last version with commonjs support.
// Should be upgraded to the latest when converting this code to es modules.
import pMap from "p-map";

import { Agent, AgentOptions } from "http";
import jsonata from "jsonata";
import { ProtocolError } from "./client";
import { getLaunchDarkly } from "./launchdarkly";
import { addRecordingEvent, readRecordings, removeRecordingFromLog } from "./recordingLog";
import {
  FilterOptions,
  ListOptions,
  Options,
  RecordingEntry,
  RecordingMetadata,
  SourceMapEntry,
  UploadOptions,
  type ExternalRecordingEntry,
} from "./types";
import { ReplayClient } from "./upload";
import { maybeLogToConsole } from "./utils";
import { logger } from "@replay-cli/shared/logger";
export type { RecordingEntry } from "./types";
export { updateStatus } from "./updateStatus";

function filterRecordings(
  recordings: RecordingEntry[],
  filter: FilterOptions["filter"],
  includeCrashes: FilterOptions["includeCrashes"]
) {
  let filteredRecordings = recordings;
  logger.info("FilterRecordings:Started", {
    numRecordingLogReplays: recordings.length,
    filterType: filter ? typeof filter : undefined,
  });
  if (filter && typeof filter === "string") {
    const exp = jsonata(`$filter($, ${filter})[]`);
    filteredRecordings = exp.evaluate(recordings) || [];

    logger.info("FilterRecordings:UsedString", {
      filteredRecordingsLength: filteredRecordings.length,
      filter,
    });
  } else if (typeof filter === "function") {
    filteredRecordings = recordings.filter(filter);

    logger.info("FilterRecordings:UsedFunction", {
      filteredRecordingsLength: filteredRecordings.length,
    });
  }

  if (includeCrashes) {
    recordings.forEach(r => {
      if (r.status === "crashed" && !filteredRecordings.includes(r)) {
        filteredRecordings.push(r);
      }
    });
    logger.info("FilterRecordings:IncludedCrashes", {
      filteredRecordingsLength: filteredRecordings.length,
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
  logger.info("ListAllRecordings:Started");
  const recordings = readRecordings();

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
  server: string,
  recording: RecordingEntry,
  verbose?: boolean,
  apiKey?: string,
  agent?: Agent
) {
  const client = new ReplayClient();
  logger.info("DoUploadCrash:Started", { recordingId: recording.id });
  maybeLogToConsole(verbose, `Starting crash data upload for ${recording.id}...`);

  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    logger.error("DoUploadCrash:CannotConnectToServer", { recordingId: recording.id, server });
    maybeLogToConsole(verbose, `Crash data upload failed: can't connect to server ${server}`);
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
  addRecordingEvent("crashUploaded", recording.id, { server });
  maybeLogToConsole(verbose, `Crash data upload finished.`);
  logger.info("DoUploadCrash:Successful", { recordingId: recording.id, server });
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
  maybeLogToConsole(verbose, `Upload failed: ${err}`);

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
  client: ReplayClient,
  recordingId: string,
  metadata: RecordingMetadata | null,
  strict: boolean,
  verbose: boolean
) {
  if (metadata) {
    try {
      await retryWithExponentialBackoff(
        () => client.setRecordingMetadata(recordingId, metadata),
        error => {
          logger.error("SetMetadata:WillRetry", {
            recordingId,
            error,
          });
        }
      );
    } catch (error) {
      logger.error("SetMetadata:Failed", {
        recordingId,
        strict,
        error,
      });
      handleUploadingError(`Failed to set recording metadata ${error}`, strict, verbose, error);
    }
  }
}

const MIN_MULTIPART_UPLOAD_SIZE = 5 * 1024 * 1024;
async function multipartUploadRecording(
  server: string,
  client: ReplayClient,
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
  await setMetadata(client, recordingId, metadata, strict, verbose);
  addRecordingEvent("uploadStarted", recording.id, {
    server,
    recordingId,
  });
  const eTags = await client.uploadRecordingInParts(
    recording.path!,
    partLinks,
    chunkSize,
    agentOptions
  );

  assert(eTags.length === partLinks.length, "Mismatched eTags and partLinks");

  await client.connectionEndRecordingMultipartUpload(recording.id, uploadId, eTags);
  return recordingId;
}

async function directUploadRecording(
  server: string,
  client: ReplayClient,
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
  await setMetadata(client, recordingId, metadata, strict, verbose);
  addRecordingEvent("uploadStarted", recording.id, {
    server,
    recordingId,
  });
  await retryWithExponentialBackoff(
    () => client.uploadRecording(recording.path!, uploadLink, size),
    error => {
      logger.error("DirectUploadRecording:WillRetry", {
        recordingId,
        error,
      });
    }
  );

  logger.info("DoUploadRecording:Succeeded", { recordingId: recording.id, sizeInBytes: size });

  await client.connectionEndRecordingUpload(recording.id);
  return recordingId;
}

async function doUploadRecording(
  server: string,
  recording: RecordingEntry,
  verbose: boolean = false,
  apiKey: string,
  agentOptions?: AgentOptions,
  removeAssets: boolean = false,
  strict: boolean = false
) {
  logger.info("DoUploadRecording:Started", { recordingId: recording.id, server });
  maybeLogToConsole(verbose, `Starting upload for ${recording.id}...`);

  if (recording.status == "uploaded" && recording.recordingId) {
    logger.info("DoUploadRecording:AlreadyUploaded", { recordingId: recording.id });
    maybeLogToConsole(verbose, `Already uploaded: ${recording.recordingId}`);

    return recording.recordingId;
  }

  const reason = uploadSkipReason(recording);
  if (reason) {
    logger.error("DoUploadRecording:Failed", {
      recordingId: recording.id,
      server,
      uploadSkipReason,
      strict,
    });

    handleUploadingError(reason, strict, verbose);
    return null;
  }

  const agent = getHttpAgent(server, agentOptions);

  if (recording.status == "crashed") {
    logger.info("DoUploadRecording:WillUploadCrashReport", {
      recordingId: recording.id,
      recordingStatus: recording.status,
    });
    await doUploadCrash(server, recording, verbose, apiKey, agent);
    logger.info("DoUploadRecording:CrashReportUploaded", {
      recordingId: recording.id,
    });
    maybeLogToConsole(verbose, `Crash report uploaded for ${recording.id}`);

    if (removeAssets) {
      removeRecordingAssets(recording);
      logger.info("DoUploadRecording:RemovedRecordingAssets", {
        recordingId: recording.id,
      });
    }
    return recording.id;
  }

  const { size } = await fs.promises.stat(recording.path!);

  logger.info("DoUploadRecording:WillUpload", {
    recording,
  });

  const client = new ReplayClient();
  if (!(await client.initConnection(server, apiKey, verbose, agent))) {
    logger.error("DoUploadRecording:ServerConnectionError", {
      recording,
      server,
      strict,
    });
    handleUploadingError(`Cannot connect to server ${server}`, strict, verbose);
    return null;
  }

  // validate metadata before uploading so invalid data can block the upload
  const metadata = await validateMetadata(client, recording.metadata, verbose);

  let recordingId: string;
  const isMultipartEnabled = await getLaunchDarkly().isEnabled("cli-multipart-upload", false);
  try {
    if (size > MIN_MULTIPART_UPLOAD_SIZE && isMultipartEnabled) {
      recordingId = await multipartUploadRecording(
        server,
        client,
        recording,
        metadata,
        size,
        strict,
        verbose,
        agentOptions
      );
    } else {
      recordingId = await directUploadRecording(
        server,
        client,
        recording,
        metadata,
        size,
        strict,
        verbose
      );
    }
  } catch (err) {
    const errorMessage = err instanceof ProtocolError ? err.protocolMessage : String(err);
    logger.error("DoUploadRecording:ProtocolError", {
      recording,
      server,
      strict,
      errorMessage,
      wasMultipartUpload: size > MIN_MULTIPART_UPLOAD_SIZE && isMultipartEnabled,
    });
    handleUploadingError(errorMessage, strict, verbose, err);
    return null;
  }

  await pMap(
    recording.sourcemaps,
    async (sourcemap: SourceMapEntry) => {
      try {
        logger.info("DoUploadRecording:WillUploadSourcemaps", {
          recordingId: recording.id,
          sourcemapPath: sourcemap.path,
        });

        const contents = fs.readFileSync(sourcemap.path, "utf8");
        const sourcemapId = await client.connectionUploadSourcemap(
          recordingId,
          sourcemap,
          contents
        );
        await pMap(
          sourcemap.originalSources,
          originalSource => {
            logger.info("DoUploadRecording:WillUploadOriginalSources", {
              recordingId: recording.id,
              sourcemapPath: sourcemap.path,
            });

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
      } catch (error) {
        logger.error("DoUploadRecording:CannotUploadSourcemapFromDisk", {
          recordingId: recording.id,
          sourcemapPath: sourcemap.path,
          error,
        });

        handleUploadingError(
          `Cannot upload sourcemap ${sourcemap.path} from disk: ${error}`,
          strict,
          verbose,
          error
        );
      }
    },
    { concurrency: 10, stopOnError: false }
  );

  if (removeAssets) {
    removeRecordingAssets(recording);
  }

  addRecordingEvent("uploadFinished", recording.id);
  const replayUrl = ` https://app.replay.io/recording/${recordingId}`;

  maybeLogToConsole(verbose, `Upload finished! View your Replay at: ${replayUrl}`);

  logger.info("DoUploadRecording:Succeeded", {
    recordingId: recording.id,
    replayUrl,
  });

  client.closeConnection();
  return recordingId;
}

async function uploadRecording(id: string, opts: UploadOptions) {
  const server = getServer(opts);
  const recordings = readRecordings();
  const recording = recordings.find(r => r.id == id);

  if (!recording) {
    maybeLogToConsole(opts.verbose, `Unknown recording ${id}`);
    logger.error("UploadRecording:UnknownRecording", {
      id,
    });

    return null;
  }

  return doUploadRecording(
    server,
    recording,
    opts.verbose,
    opts.apiKey,
    opts.agentOptions,
    opts.removeAssets ?? true,
    opts.strict
  );
}

function maybeRemoveAssetFile(asset?: string) {
  if (asset) {
    try {
      if (fs.existsSync(asset)) {
        logger.info("MaybeRemoveAssetFile:Removing", { asset });
        fs.unlinkSync(asset);
      }
    } catch (error) {
      logger.error("MaybeRemoveAssetFile:Failed", { asset, error });
    }
  }
}

function removeRecording(id: string, opts: Options = {}) {
  const recordings = readRecordings();
  const recording = recordings.find(r => r.id == id);
  if (!recording) {
    logger.error("RemoveRecording:UnknownRecording", {
      id,
    });
    maybeLogToConsole(opts.verbose, `Unknown recording ${id}`);
    return false;
  }
  removeRecordingAssets(recording);
  removeRecordingFromLog(id);
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

function removeRecordingAssets(recording: RecordingEntry) {
  const localRecordings = listAllRecordings({
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

export { listAllRecordings, removeRecording, uploadRecording };
