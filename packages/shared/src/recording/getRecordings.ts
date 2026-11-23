import { existsSync, realpathSync } from "fs-extra";
import assert from "node:assert/strict";
import { basename, isAbsolute, relative, sep } from "path";
import { logDebug, logError } from "../logger";
import { recordingLogPath, recordingsPath } from "./config";
import { readRecordingLog } from "./readRecordingLog";
import { LocalRecording, LogEntry, RECORDING_LOG_KIND } from "./types";

export function getRecordings(processGroupIdFilter?: string): LocalRecording[] {
  const recordings: LocalRecording[] = [];
  const idToRecording: Record<string, LocalRecording> = {};

  if (existsSync(recordingLogPath)) {
    const entries = readRecordingLog();

    logDebug("Reading recording log", { entries, recordingLogPath });

    const idToStartTimestamp: Record<string, number> = {};
    const droppedSourceMapIds = new Set<string>();

    for (let entry of entries) {
      switch (entry.kind) {
        case RECORDING_LOG_KIND.addMetadata: {
          const { id, metadata = {} } = entry;
          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          Object.assign(recording.metadata, metadata);

          const { argv, process, processGroupId, title, uri } = metadata;

          if (title) {
            recording.metadata.title = title;
          }

          if (uri) {
            let host = uri;
            if (host && typeof host === "string") {
              try {
                recording.metadata.host = new URL(host).host;
              } catch (error) {
                recording.metadata.host = host;
              }
            }
          } else if (Array.isArray(argv) && typeof argv[0] === "string") {
            recording.metadata.host = basename(argv[0]);
          }

          if (process) {
            recording.metadata.processType = process;
          }

          if (processGroupId) {
            recording.metadata.processGroupId = processGroupId;
          }
          break;
        }
        case RECORDING_LOG_KIND.crashData: {
          const { data, id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          if (recording.crashData) {
            recording.crashData.push(data);
          } else {
            recording.crashData = [data];
          }
          break;
        }
        case RECORDING_LOG_KIND.crashed: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.recordingStatus = "crashed";
          break;
        }
        case RECORDING_LOG_KIND.crashUploaded: {
          // No-op
          break;
        }
        case RECORDING_LOG_KIND.createRecording: {
          const recording: LocalRecording = {
            buildId: entry.buildId as string,
            crashData: undefined,
            date: new Date(entry.timestamp),
            driverVersion: entry.driverVersion as string,
            duration: undefined,
            id: entry.id,
            metadata: {
              host: undefined,
              processGroupId: undefined,
              processType: undefined,
              sourceMaps: [],
              title: undefined,
              uri: undefined,
            },
            path: undefined,
            processingStatus: undefined,
            recordingStatus: "recording",
            unusableReason: undefined,
            uploadStatus: undefined,
            uploadError: undefined,
          };

          idToRecording[entry.id] = recording;

          recordings.push(recording);
          break;
        }
        case RECORDING_LOG_KIND.originalSourceAdded: {
          const { recordingId, parentId, path, parentOffset } = entry;
          assert(recordingId, '"originalSourceAdded" entry must have a "recordingId"');
          assert(parentId, '"originalSourceAdded" entry must have a "parentId"');
          assert(path, '"originalSourceAdded" entry must have a "path"');
          assert(
            typeof parentOffset === "number",
            '"originalSourceAdded" entry must have a numeric "parentOffset"'
          );
          if (droppedSourceMapIds.has(parentId)) {
            continue;
          }
          if (!isInRecordingsDirectory(path)) {
            logNotInRecordingsDirectoryWarning(entry);
            continue;
          }

          const recording = idToRecording[recordingId];
          if (!recording) {
            logNotFoundWarning(recordingId, entry);
            continue;
          }

          const sourceMap = recording.metadata.sourceMaps.find(
            sourceMap => sourceMap.id === parentId
          );
          assert(sourceMap, `Source map with ID "${parentId}" not found`);

          sourceMap.originalSources.push({
            path,
            parentOffset,
          });
          break;
        }
        case RECORDING_LOG_KIND.processingFailed: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.processingStatus = "failed";
          break;
        }
        case RECORDING_LOG_KIND.processingFinished: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.processingStatus = "processed";
          break;
        }
        case RECORDING_LOG_KIND.processingStarted: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.processingStatus = "processing";
          break;
        }
        case RECORDING_LOG_KIND.recordingUnusable: {
          const { id, reason } = entry;
          const recording = idToRecording[id];

          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.recordingStatus = "unusable";
          recording.unusableReason = reason;
          break;
        }
        case RECORDING_LOG_KIND.sourcemapAdded: {
          const {
            path,
            recordingId,
            id,
            baseURL,
            targetContentHash,
            targetURLHash,
            targetMapURLHash,
          } = entry;
          assert(recordingId, '"sourcemapAdded" entry must have a "recordingId"');
          assert(path, '"sourcemapAdded" entry must have a "path"');
          assert(baseURL, '"sourcemapAdded" entry must have a "baseURL"');
          assert(targetMapURLHash, '"sourcemapAdded" entry must have a "targetMapURLHash"');
          if (!isInRecordingsDirectory(path)) {
            logNotInRecordingsDirectoryWarning(entry);
            droppedSourceMapIds.add(id);
            continue;
          }

          const recording = idToRecording[recordingId];
          if (!recording) {
            logNotFoundWarning(recordingId, entry);
            continue;
          }

          recording.metadata.sourceMaps.push({
            id,
            path,
            baseURL,
            targetContentHash,
            targetURLHash,
            targetMapURLHash,
            originalSources: [],
          });
          break;
        }
        case RECORDING_LOG_KIND.uploadFailed: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.uploadStatus = "failed";
          break;
        }
        case RECORDING_LOG_KIND.uploadFinished: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.uploadStatus = "uploaded";
          break;
        }
        case RECORDING_LOG_KIND.uploadStarted: {
          const { id } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.uploadStatus = "uploading";
          break;
        }
        case RECORDING_LOG_KIND.writeFinished: {
          const { id, timestamp } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.recordingStatus = "finished";

          const startTimestamp = idToStartTimestamp[id];
          if (startTimestamp != undefined) {
            recording.duration = timestamp - idToStartTimestamp[id];
          }
          break;
        }
        case RECORDING_LOG_KIND.writeStarted: {
          const { id, path, timestamp } = entry;

          const recording = idToRecording[id];
          if (!recording) {
            logNotFoundWarning(id, entry);
            continue;
          }

          recording.path = path;
          idToStartTimestamp[id] = timestamp;
          break;
        }
      }
    }
  }

  logDebug(`Found ${recordings.length} recordings`, { recordings });

  return (
    recordings
      .filter(recording => {
        if (processGroupIdFilter && recording.metadata.processGroupId !== processGroupIdFilter) {
          return false;
        }

        switch (recording.recordingStatus) {
          case "finished":
            if (!recording.metadata.host) {
              // Ignore new/empty tab recordings (see TT-1036)
              //
              // Note that we filter all "empty" recordings, not just root recordings,
              // because Chrome loads its default new tab content via an <iframe>
              //
              // Also note that we only remove finished recordings in this way,
              // because it's important to report unusable or crashed recordings to the user
              // Those may have crashed before host metadata was added
              return false;
            }
            break;
        }

        return true;
      })
      // Sort recordings in reverse chronological order
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  );
}

// recordings.log may name any file, e.g. one a recorded page named: only files
// in the recordings directory, symbolic links resolved, are recording resources.
function isInRecordingsDirectory(file: string) {
  let realFile: string;
  try {
    realFile = realpathSync(file);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
  const relativeFile = relative(realpathSync(recordingsPath), realFile);
  return relativeFile !== ".." && !relativeFile.startsWith(`..${sep}`) && !isAbsolute(relativeFile);
}

function logNotInRecordingsDirectoryWarning(entry: LogEntry) {
  logError("RecordingLog:ResourceNotInRecordingsDirectory", { entry });
}

function logNotFoundWarning(recordingId: string, entry: LogEntry) {
  logError("RecordingLog:RecordingNotFound", {
    recordingId,
    entry,
  });
}
