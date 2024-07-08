import path from "node:path";
import { appendFileSync } from "node:fs";
import { UnstructuredMetadata } from "../types";
import { getReplayPath } from "../../getReplayPath";

/**
 * Adds unstructured metadata to the local recordings database.
 *
 * New metadata will be merged with existing data. If the same key is used by
 * multiple entries, the most recent entry's value will be used.
 *
 * Metadata is not validated until the recording is uploaded so arbitrary keys
 * may be used here to manage recordings before upload.
 *
 * @param recordingId UUID of the recording
 * @param metadata Recording metadata
 */
export function addMetadata(recordingId: string, metadata: UnstructuredMetadata) {
  const entry = {
    id: recordingId,
    kind: "addMetadata",
    metadata,
    timestamp: Date.now(),
  };

  appendFileSync(path.join(getReplayPath(), "recordings.log"), `\n${JSON.stringify(entry)}\n`);
}
