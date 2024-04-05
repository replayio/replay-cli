import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerAuthenticatedCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { promptForUpdate } from "../utils/installation/promptForUpdate";
import { getRecordings } from "../utils/recordings/getRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
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
    const selectedRecordings = await selectRecordings(recordingsNew, {
      prompt: "New recording(s) found. Which would you like to upload?",
      selectionMessage: "The following recording(s) will be uploaded:",
    });

    if (selectedRecordings.length > 0) {
      const processAfterUpload = await confirm(
        "Would you like the selected recording(s) to be processed?"
      );
      if (processAfterUpload) {
        console.log("After upload, the selected recording(s) will be processed.\n");
      }

      await uploadRecordings(selectedRecordings, { processAfterUpload });
    }
  } else {
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
