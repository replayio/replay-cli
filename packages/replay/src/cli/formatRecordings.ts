/*
 * This module is responsible for formatting recordings that are going to be printed to the console.
 */
import table from "text-table";

import { generateDefaultTitle } from "../generateDefaultTitle";
import { ExternalRecordingEntry } from "../types";

const MsPerSecond = 1000;
const MsPerMinute = MsPerSecond * 60;
const MsPerHour = MsPerMinute * 60;
const MsPerDay = MsPerHour * 24;

function formatTime(time: Date) {
  const fmt = new Intl.RelativeTimeFormat("en", {
    style: "long",
  });

  const ds = Date.now() - time.getTime();
  if (ds < MsPerMinute) {
    return fmt.format(Math.round(-ds / MsPerSecond), "second");
  } else if (ds < MsPerHour) {
    return fmt.format(Math.round(-ds / MsPerMinute), "minute");
  } else if (ds < MsPerDay) {
    return fmt.format(Math.round(-ds / MsPerHour), "hour");
  }

  return fmt.format(Math.round(-ds / MsPerDay), "day");
}

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
    return [recording.id, recording.status, title || "", formatTime(recording.createTime)];
  });

  const tableBody: Array<Array<string>> = [
    ["ID", "Status", "Title", "Created"],
    ...formattedRecordings,
  ];

  return table(tableBody);
}

export function formatAllRecordingsJson(recordings: ExternalRecordingEntry[]) {
  return JSON.stringify(recordings, null, 2);
}
