import chalk from "chalk";
import { requireAuthentication } from "../utils/authentication/requireAuthentication";
import { registerCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { getRecordings } from "../utils/recordings/getRecordings";
import { processUploadedRecordings } from "../utils/recordings/processUploadedRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/uploadRecordings";

registerCommand("upload")
  .argument("[ids]", `Recording ids ${chalk.dim("(comma-separated)")}`)
  .option("-a, --all", "Upload all recordings")
  .option("-p, --process", "Process uploaded recording(s)")
  .description("Upload recording(s)")
  .action(upload);

async function upload(
  ids: string[] | undefined,
  {
    all = false,
    process: shouldProcess,
  }: {
    all?: boolean;
    process?: boolean;
  } = {}
) {
  await requireAuthentication(false);

  const recordings = await getRecordings();

  let selectedRecordings: LocalRecording[] = [];
  if (ids && ids.length > 0) {
    selectedRecordings = recordings.filter(recording => ids.includes(recording.id));
  } else if (all) {
    selectedRecordings = recordings;
  } else {
    selectedRecordings = await selectRecordings(recordings, {
      maxRecordingsToDisplay: 10,
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
  }

  await exitProcess(0);
}
