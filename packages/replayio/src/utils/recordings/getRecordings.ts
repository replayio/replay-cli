import assert from "assert";
import { existsSync } from "fs-extra";
import { basename } from "path";
import { recordingLogPath } from "./config";
import { debug } from "./debug";
import { readRecordingLogLines } from "./readRecordingLogLines";
import { LocalRecording, LogEntry, RECORDING_LOG_KIND } from "./types";

export function getRecordings(): LocalRecording[] {
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
                sourcemaps: undefined,
                uri: undefined,
              },
              path: undefined,
              recordingStatus: "recording",
              uploadStatus: undefined,
            };

            idToRecording[entry.id] = recording;

            recordings.push(recording);
            break;
          }
          case RECORDING_LOG_KIND.originalSourceAdded: {
            // TODO [PRO-103] Handle this event type
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
            const { path, recordingId } = entry;
            assert(path, '"sourcemapAdded" entry must have a "path"');
            assert(recordingId, '"sourcemapAdded" entry must have a "recordingId"');

            const recording = idToRecording[recordingId];
            assert(recording, `Recording with ID "${recordingId}" not found`);
            if (recording.metadata.sourcemaps) {
              recording.metadata.sourcemaps.push(path);
            } else {
              recording.metadata.sourcemaps = [path];
            }
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
            recording.uploadStatus = "uploading";
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

  // Sort recordings in reverse chronological order
  // but group related recordings so that "root" recordings are always listed first
  recordings.sort((a, b) => {
    if (a.metadata.processGroupId === b.metadata.processGroupId) {
      if (a.metadata.processType === "root") {
        return -1;
      } else if (b.metadata.processType === "root") {
        return 1;
      }
    }

    return b.date.getTime() - a.date.getTime();
  });

  return recordings;
}
