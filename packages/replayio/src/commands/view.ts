import { spawn } from "child_process";
import { replayAppHost } from "../config";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { getSystemOpenCommand } from "../utils/getSystemOpenCommand";
import { findRecordingsWithShortIds } from "../utils/recordings/findRecordingsWithShortIds";
import { getRecordings } from "../utils/recordings/getRecordings";

registerCommand("view <id>").description("Upload one or more recordings").action(view);

async function view(idOrShortId: string) {
  let id = idOrShortId;
  if (!id.includes("-")) {
    const recordings = await getRecordings();
    const ids = findRecordingsWithShortIds(recordings, [idOrShortId]);
    if (ids.length === 1) {
      id = ids[0].id;
    }
  }

  const url = `${replayAppHost}/recording/${id}`;

  spawn(getSystemOpenCommand(), [url]);

  await exitProcess(0);
}
