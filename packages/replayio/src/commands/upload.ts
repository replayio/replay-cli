import chalk from "chalk";
import { registerAuthenticatedCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { canUpload } from "../utils/recordings/canUpload";
import { findRecordingsWithShortIds } from "../utils/recordings/findRecordingsWithShortIds";
import { getRecordings } from "../utils/recordings/getRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";

registerAuthenticatedCommand("upload")
  .argument("[ids...]", `Recording ids ${chalk.gray("(comma-separated)")}`, value =>
    value.split(",")
  )
  .option("-a, --all", "Upload all recordings")
  .option("-p, --process", "Process uploaded recording(s)")
  .description("Upload recording(s)")
  .action(upload);

async function upload(
  shortIds: string[],
  {
    all = false,
    process: processAfterUpload,
  }: {
    all?: boolean;
    process?: boolean;
  } = {}
) {
  const recordings = await getRecordings();

  let selectedRecordings: LocalRecording[] = [];
  if (shortIds.length > 0) {
    selectedRecordings = findRecordingsWithShortIds(recordings, shortIds);
  } else if (all) {
    selectedRecordings = recordings;
  } else {
    selectedRecordings = await selectRecordings(recordings, {
      disabledSelector: recording => !canUpload(recording),
      prompt: "Which recordings would you like to upload?",
      selectionMessage: "The following recording(s) will be uploaded:",
    });
  }

  if (selectedRecordings.length > 0) {
    if (processAfterUpload == null) {
      processAfterUpload = await confirm(
        "Would you like the selected recording(s) to be processed?",
        true
      );
      if (processAfterUpload) {
        console.log("After upload, the selected recording(s) will be processed.\n");
      }
    }

    await uploadRecordings(selectedRecordings, { processAfterUpload });
  }

  await exitProcess(0);
}
