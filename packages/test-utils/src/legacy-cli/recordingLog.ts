import fs from "fs";
import path from "path";
import { RecordingEntry } from "./types";
import { generateDefaultTitle } from "./generateDefaultTitle";
import { updateStatus } from "./updateStatus";
import { getDirectory } from "./utils";
import { logger } from "@replay-cli/shared/logger";

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
const RECORDING_LOG_KIND = [
  "createRecording",
  "addMetadata",
  "writeStarted",
  "sourcemapAdded",
  "originalSourceAdded",
  "writeFinished",
  "uploadStarted",
  "uploadFinished",
  "recordingUnusable",
  "crashed",
  "crashData",
  "crashUploaded",
] as const;
interface RecordingLogEntry {
  [key: string]: any;
  kind: (typeof RECORDING_LOG_KIND)[number];
}
export function readRecordings(dir?: string, includeHidden = false) {
  dir = getDirectory({ directory: dir });
  const recordings: RecordingEntry[] = [];
  const lines = readRecordingFile(dir)
    .map(line => {
      try {
        return JSON.parse(line) as RecordingLogEntry;
      } catch {
        return null;
      }
    })
    .filter(o => o != null)
    .sort((a, b) => RECORDING_LOG_KIND.indexOf(a.kind) - RECORDING_LOG_KIND.indexOf(b.kind));

  for (const obj of lines) {
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

function addRecordingEvent(dir: string, kind: string, id: string, tags = {}) {
  const event = {
    kind,
    id,
    timestamp: Date.now(),
    ...tags,
  };
  logger.info("AddRecordingEvent:Started", { event, kind });
  const lines = readRecordingFile(dir);
  lines.push(JSON.stringify(event));
  writeRecordingFile(dir, lines);
}

function removeRecordingFromLog(dir: string, id: string) {
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
}

export { readRecordingFile, removeRecordingFromLog, addRecordingEvent };
