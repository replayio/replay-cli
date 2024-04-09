import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerAuthenticatedCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { promptForUpdate } from "../utils/installation/promptForUpdate";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";

registerAuthenticatedCommand("record")
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Launch the replay browser in recording mode")
  .action(record);

async function record(url: string = "about:blank") {
  await promptForUpdate();

  const recordingsBefore = await getRecordings();

  await launchBrowser(url);

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
      selectedRecordings = await selectRecordings(recordingsNew, {
        defaultSelected: recording => recording.metadata.processType === "root",
        prompt: "New recordings found. Which would you like to upload?",
        selectionMessage: "The following recording(s) will be uploaded:",
      });
    }

    if (selectedRecordings.length > 0) {
      await uploadRecordings(selectedRecordings, { processAfterUpload: true });
    }
  } else {
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
