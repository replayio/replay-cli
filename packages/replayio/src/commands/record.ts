import { v4 as uuid } from "uuid";
import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerCommand } from "../utils/commander/registerCommand";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { findMostRecentPrimaryRecording } from "../utils/recordings/findMostRecentPrimaryRecording";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";

registerCommand("record", { checkForRuntimeUpdate: true, requireAuthentication: true })
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Launch the replay browser in recording mode")
  .action(record);

async function record(url: string = "about:blank") {
  const recordingsBefore = await getRecordings();

  await launchBrowser(url, { processGroupId: uuid() });

  const recordingsAfter = await getRecordings();
  const recordingsNew = recordingsAfter.filter(
    recording => !recordingsBefore.some(({ id }) => id === recording.id)
  );

  console.log(""); // Spacing for readability

  if (recordingsNew.length > 0) {
    let selectedRecordings: LocalRecording[] = [];
    if (recordingsNew.length === 1) {
      const confirmed = await confirm(
        "New recording found. Would you like to upload it?",
        true,
        "\n" +
          printRecordings(recordingsNew, {
            showHeaderRow: false,
          })
      );
      if (confirmed) {
        selectedRecordings = recordingsNew;
      }

      console.log(""); // Spacing for readability
    } else {
      const defaultRecording = findMostRecentPrimaryRecording(recordingsNew);

      selectedRecordings = await selectRecordings(recordingsNew, {
        defaultSelected: recording => recording === defaultRecording,
        prompt: "New recordings found. Which would you like to upload?",
        selectionMessage: "The following recording(s) will be uploaded:",
      });
    }

    if (selectedRecordings.length > 0) {
      await uploadRecordings(selectedRecordings, { processAfterUpload: false });
    }
  } else {
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
