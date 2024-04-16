import { v4 as uuid } from "uuid";
import { logAsyncOperation } from "../utils/async/logAsyncOperation";
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
  const prevRecordings = await getRecordings();

  await launchBrowser(url, { processGroupId: uuid() });

  const recordingsAfter = await getRecordings();

  const nextCrashedRecordings: LocalRecording[] = [];
  const nextRecordings: LocalRecording[] = [];

  recordingsAfter.filter(recording => {
    if (!prevRecordings.some(({ id }) => id === recording.id)) {
      if (recording.recordingStatus === "crashed") {
        nextCrashedRecordings.push(recording);
      } else {
        nextRecordings.push(recording);
      }
    }
  });

  console.log(""); // Spacing for readability

  // First check for any new crashes; these we should upload automatically
  if (nextCrashedRecordings.length > 0) {
    console.log(
      "It looks like something went wrong with this recording. Please hold while we upload crash data."
    );

    const promise = uploadRecordings(nextCrashedRecordings, {
      processingBehavior: "do-not-process",
      silent: true,
    });

    const progress = logAsyncOperation("Uploading crash data...");
    const uploadableCrashes = await promise;

    if (uploadableCrashes.some(recording => recording.uploadStatus === "failed")) {
      progress.setFailed("Crash data could only be partially uploaded");
    } else {
      progress.setSuccess("Crash data uploaded successfully");
    }

    console.log(""); // Spacing for readability
  }

  // Then let the user decide what to do with the other new recordings
  if (nextRecordings.length > 0) {
    let selectedRecordings: LocalRecording[] = [];
    if (nextRecordings.length === 1) {
      const confirmed = await confirm(
        "New recording found. Would you like to upload it?",
        true,
        "\n" +
          printRecordings(nextRecordings, {
            showHeaderRow: false,
          })
      );
      if (confirmed) {
        selectedRecordings = nextRecordings;
      }

      console.log(""); // Spacing for readability
    } else {
      const defaultRecording = findMostRecentPrimaryRecording(nextRecordings);

      selectedRecordings = await selectRecordings(nextRecordings, {
        defaultSelected: recording => recording === defaultRecording,
        prompt: "New recordings found. Which would you like to upload?",
        selectionMessage: "The following recording(s) will be uploaded:",
      });
    }

    if (selectedRecordings.length > 0) {
      await uploadRecordings(selectedRecordings, { processingBehavior: "start-processing" });
    }
  } else if (nextCrashedRecordings.length === 0) {
    // It doesn't make sense to print this message if there were crashes
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
