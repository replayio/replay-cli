import assert from "assert";
import { existsSync, readFileSync } from "fs-extra";
import { basename } from "path";
import { logPath } from "./config";
import { debug } from "./debug";
import { LocalRecording, LogEntry, RECORDING_LOG_KIND } from "./types";

export function getRecordings(): LocalRecording[] {
  const recordings: LocalRecording[] = [];
  const idToRecording: Record<string, LocalRecording> = {};

  if (existsSync(logPath)) {
    debug("Reading recording log %s", logPath);

    const log = readFileSync(logPath, "utf8");
    const lines = log.split("\n");

    debug("Found %s recording", lines.length);

    const idToStartTimestamp: Record<string, number> = {};

    lines.forEach(text => {
      if (text) {
        const entry = JSON.parse(text) as LogEntry;

        debug(JSON.stringify(entry, null, 2));

        switch (entry.kind) {
          case RECORDING_LOG_KIND.addMetadata: {
            const { id, metadata = {} } = entry;
            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            if (entry.metadata?.uri) {
              let host = metadata.uri;
              if (host && typeof host === "string") {
                try {
                  const url = new URL(host);
                  host = url.host;
                } finally {
                  recording.metadata.host = host;
                }
              }
            } else if (Array.isArray(metadata.argv) && typeof metadata.argv[0] === "string") {
              recording.metadata.host = basename(metadata.argv[0]);
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
                sourcemaps: undefined,
              },
              path: undefined,
              recordingStatus: "in-progress",
              uploadStatus: undefined,
            };

            idToRecording[entry.id] = recording;

            // Newest to oldest
            recordings.unshift(recording);
            break;
          }
          case RECORDING_LOG_KIND.originalSourceAdded: {
            // No-op
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
          case RECORDING_LOG_KIND.uploadFinished: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            recording.uploadStatus = "finished";
            break;
          }
          case RECORDING_LOG_KIND.uploadStarted: {
            const { id } = entry;

            const recording = idToRecording[id];
            assert(recording, `Recording with ID "${id}" not found`);
            recording.uploadStatus = "in-progress";
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
      }
    });
  } else {
    debug("No recording log found at %s", logPath);
  }

  return recordings;
}
