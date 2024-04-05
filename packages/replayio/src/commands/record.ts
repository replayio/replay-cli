import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerAuthenticatedCommand } from "../utils/commander";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { promptForUpdate } from "../utils/installation/promptForUpdate";
import { getRecordings } from "../utils/recordings/getRecordings";
import { processUploadedRecordings } from "../utils/recordings/processUploadedRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { uploadRecordings } from "../utils/recordings/uploadRecordings";

registerAuthenticatedCommand("record [url]")
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
      const shouldProcess = await confirm(
        "Would you like the selected recording(s) to be processed?"
      );
      if (shouldProcess) {
        console.log("After upload, the selected recording(s) will be processed.\n");
      }

      await uploadRecordings(selectedRecordings);

      if (shouldProcess) {
        await processUploadedRecordings(selectedRecordings);
      }
    }
  } else {
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
