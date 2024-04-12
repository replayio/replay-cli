import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";
import { canUpload } from "../utils/recordings/canUpload";
import { findMostRecentPrimaryRecording } from "../utils/recordings/findMostRecentPrimaryRecording";
import { findRecordingsWithShortIds } from "../utils/recordings/findRecordingsWithShortIds";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";
import { dim } from "../utils/theme";

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
  const recordings = await getRecordings();

  let selectedRecordings: LocalRecording[] = [];
  if (shortIds.length > 0) {
    selectedRecordings = findRecordingsWithShortIds(recordings, shortIds);
  } else if (all) {
    selectedRecordings = recordings;
  } else if (recordings.length === 0) {
    console.log("No recordings found.");
  } else {
    const defaultRecording = findMostRecentPrimaryRecording(recordings);

    selectedRecordings = await selectRecordings(recordings, {
      defaultSelected: recording => recording === defaultRecording,
      disabledSelector: recording => !canUpload(recording),
      noSelectableRecordingsMessage:
        "The recording(s) below cannot be uploaded.\n" +
        printRecordings(recordings, { showHeaderRow: false }),
      prompt: "Which recordings would you like to upload?",
      selectionMessage: "The following recording(s) will be uploaded:",
    });
  }

  if (selectedRecordings.length > 0) {
    await uploadRecordings(selectedRecordings, { processAfterUpload: false });
  }

  await exitProcess(0);
}
