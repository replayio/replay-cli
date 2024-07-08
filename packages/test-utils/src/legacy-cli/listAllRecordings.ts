import jsonata from "jsonata";
import { readRecordings } from "./recordingLog";
import {
  FilterOptions,
  ListOptions,
  Options,
  RecordingEntry,
  type ExternalRecordingEntry,
} from "./types";
import { logger } from "@replay-cli/shared/logger";

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

export function listAllRecordings(opts: Options & ListOptions = {}) {
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
