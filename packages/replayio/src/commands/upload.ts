import chalk from "chalk";
import { registerAuthenticatedCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { canUpload } from "../utils/recordings/canUpload";
import { findRecordingsWithShortIds } from "../utils/recordings/findRecordingsWithShortIds";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printViewRecordingLinks } from "../utils/recordings/printViewRecordingLinks";
import { processUploadedRecordings } from "../utils/recordings/processUploadedRecordings";
import { removeFromDisk } from "../utils/recordings/removeFromDisk";
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
    process: shouldProcess,
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
    if (shouldProcess == null) {
      shouldProcess = await confirm("Would you like the selected recording(s) to be processed?");
      if (shouldProcess) {
        console.log("After upload, the selected recording(s) will be processed.\n");
      }
    }

    await uploadRecordings(selectedRecordings);

    if (shouldProcess) {
      await processUploadedRecordings(selectedRecordings);
    }

    const uploadedRecordings = selectedRecordings.filter(
      recording => recording.uploadStatus === "uploaded"
    );

    printViewRecordingLinks(uploadedRecordings);

    uploadedRecordings.forEach(recording => {
      removeFromDisk(recording.id);
    });
  }

  await exitProcess(0);
}
