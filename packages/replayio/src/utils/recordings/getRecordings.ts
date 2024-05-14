import assert from "assert";
import { existsSync } from "fs-extra";
import { basename } from "path";
import { recordingLogPath } from "./config";
import { debug } from "./debug";
import { readRecordingLogLines } from "./readRecordingLogLines";
import { LocalRecording, LogEntry, RECORDING_LOG_KIND } from "./types";

export function getRecordings(processGroupIdFilter?: string): LocalRecording[] {
  const recordings: LocalRecording[] = [];
  const idToRecording: Record<string, LocalRecording> = {};

  if (existsSync(recordingLogPath)) {
    const rawTextLines = readRecordingLogLines();

    debug("Reading recording log %s\n%s", recordingLogPath, rawTextLines.join("\n"));

    const idToStartTimestamp: Record<string, number> = {};

    for (let line of rawTextLines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        switch (entry.kind) {
          case RECORDING_LOG_KIND.addMetadata: {
            const { id, metadata = {} } = entry;
            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);

            Object.assign(recording.metadata, metadata);

            const { argv, process, processGroupId, uri } = metadata;

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
            assert(recording, `Recording with ID "${id}" not found`);
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
            assert(recording, `Recording with ID "${id}" not found`);
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
                uri: undefined,
              },
              path: undefined,
              processingStatus: undefined,
              recordingStatus: "recording",
              uploadStatus: undefined,
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

            const recording = idToRecording[recordingId];
            assert(recording, `Recording with ID "${recordingId}" not found`);

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
            assert(recording, `Recording with ID "${id}" not found`);
            recording.processingStatus = "failed";
            break;
          }
          case RECORDING_LOG_KIND.processingFinished: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            recording.processingStatus = "processed";
            break;
          }
          case RECORDING_LOG_KIND.processingStarted: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            recording.processingStatus = "processing";
            break;
          }
          case RECORDING_LOG_KIND.recordingUnusable: {
            const { id } = entry;
            const recording = idToRecording[id];

            assert(recording, `Recording with ID "${id}" not found`);
            recording.recordingStatus = "unusable";

            const index = recordings.indexOf(recording);
            recordings.splice(index, 1);
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

            const recording = idToRecording[recordingId];
            assert(recording, `Recording with ID "${recordingId}" not found`);

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
            assert(recording, `Recording with ID "${id}" not found`);
            recording.uploadStatus = "failed";
            break;
          }
          case RECORDING_LOG_KIND.uploadFinished: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            recording.uploadStatus = "uploaded";
            break;
          }
          case RECORDING_LOG_KIND.uploadStarted: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            // if we can only find the "uploadStarted" log then we have to assume that this upload has failed or has been canceled
            // we can't retry those as "Internal.beginRecordingUpload" has already been called before and it fails on the second attempt
            // recordings line create a timeline so "uploadFinished" still has a chance to update this status to "uploaded"
            recording.uploadStatus = "failed";
            break;
          }
          case RECORDING_LOG_KIND.writeFinished: {
            const { id, timestamp } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
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
            assert(recording, `Recording with ID "${id}" not found`);
            recording.path = path;
            idToStartTimestamp[id] = timestamp;
            break;
          }
        }
      } catch (error) {
        debug(`Error parsing line:\n${line}`);
        continue;
      }
    }
  }

  debug("Found %s recordings:\n%o", recordings.length, recordings);

  return (
    recordings
      .filter(recording => {
        if (processGroupIdFilter && recording.metadata.processGroupId !== processGroupIdFilter) {
          return false;
        }

        if (!recording.metadata.host) {
          // Ignore new/empty tab recordings (see TT-1036)
          // Note that we filter all "empty" recordings, not just root recordings,
          // because Chrome loads its default new tab content via an <iframe>
          return false;
        }

        return true;
      })
      // Sort recordings in reverse chronological order
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  );
}
