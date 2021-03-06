/*
 * This module is responsible for formatting recordings that are going to be printed to the console.
 */
import table from "text-table";

import { generateDefaultTitle } from "../generateDefaultTitle";
import { ExternalRecordingEntry } from "../types";

export function formatAllRecordingsHumanReadable(recordings: ExternalRecordingEntry[]) {
  // sort by created at date
  recordings.sort((a, b) => {
    return b.createTime.getTime() - a.createTime.getTime();
  });
  const formattedRecordings = recordings.map(recording => {
    const title =
      typeof recording.metadata?.title === "string"
        ? recording.metadata.title
        : generateDefaultTitle(recording.metadata);
    return [recording.id, recording.status, title || "", recording.createTime.toISOString()];
  });

  const tableBody: Array<Array<string>> = [
    ["ID", "Status", "Title", "Created At"],
    ...formattedRecordings,
  ];

  return table(tableBody);
}

export function formatAllRecordingsJson(recordings: ExternalRecordingEntry[]) {
  return JSON.stringify(recordings, null, 2);
}
