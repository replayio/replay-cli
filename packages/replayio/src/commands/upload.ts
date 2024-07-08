import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { findRecordingsWithShortIds } from "@replay-cli/shared/recording/findRecordingsWithShortIds";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { printRecordings } from "@replay-cli/shared/recording/printRecordings";
import { selectRecordings } from "@replay-cli/shared/recording/selectRecordings";
import { LocalRecording } from "@replay-cli/shared/recording/types";
import { dim } from "@replay-cli/shared/theme";
import { registerCommand } from "../utils/commander/registerCommand";
import { uploadRecordings } from "../utils/recordings/uploadRecordings";

registerCommand("upload", { requireAuthentication: true })
  .argument("[ids...]", `Recording ids ${dim("(comma-separated)")}`, value => value.split(","))
  .option("-a, --all", "Upload all recordings")
  .description("Upload recording(s)")
  .action(upload);

async function upload(
  shortIds: string[],
  {
    all = false,
  }: {
    all?: boolean;
  } = {}
) {
  const recordings = getRecordings();

  let selectedRecordings: LocalRecording[] = [];
  if (shortIds.length > 0) {
    selectedRecordings = findRecordingsWithShortIds(recordings, shortIds);
  } else if (all) {
    selectedRecordings = recordings;
  } else if (recordings.length === 0) {
    console.log("No recordings found.");
  } else {
    if (!process.stdin.isTTY) {
      console.log("Recording ids argument required for non-TTY environments.");

      await exitProcess(1);
    }

    selectedRecordings = await selectRecordings(recordings, {
      defaultSelected: recording => recording.metadata.processType === "root",
      noSelectableRecordingsMessage:
        "The recording(s) below cannot be uploaded.\n" +
        printRecordings(recordings, { showHeaderRow: false }),
      prompt: "Which recordings would you like to upload?",
      selectionMessage: "The following recording(s) will be uploaded:",
    });
  }

  if (selectedRecordings.length > 0) {
    await uploadRecordings(selectedRecordings, { processingBehavior: "start-processing" });
  }

  await exitProcess(0);
}
