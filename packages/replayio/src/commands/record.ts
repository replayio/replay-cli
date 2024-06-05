import debug from "debug";
import { v4 as uuid } from "uuid";
import { ProcessError } from "../utils/ProcessError";
import { logAsyncOperation } from "../utils/async/logAsyncOperation";
import { getRunningProcess } from "../utils/browser/getRunningProcess";
import { launchBrowser } from "../utils/browser/launchBrowser";
import { reportBrowserCrash } from "../utils/browser/reportBrowserCrash";
import { registerCommand } from "../utils/commander/registerCommand";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { killProcess } from "../utils/killProcess";
import { trackEvent } from "../utils/mixpanel/trackEvent";
import { canUpload } from "../utils/recordings/canUpload";
import { getRecordingUnusableReason } from "../utils/recordings/getRecordingUnusableReason";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";
import { dim, statusFailed } from "../utils/theme";

registerCommand("record", { checkForRuntimeUpdate: true, requireAuthentication: true })
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Launch the replay browser in recording mode")
  .action(record)
  .allowUnknownOption();

async function record(url: string = "about:blank") {
  // this flag is intentionally not listed in the command options
  const verbose = process.argv.includes("--verbose");
  if (verbose) {
    debug.enable("replayio:*");
  }

  const processGroupId = uuid();

  try {
    const process = await getRunningProcess();
    if (process) {
      const confirmed = await confirm(
        "The replay browser is already running. You'll need to close it before starting a new recording.\n\nWould you like to close it now?",
        true
      );
      if (confirmed) {
        const killResult = await killProcess(process.pid);
        if (!killResult) {
          console.log("Something went wrong trying to close the replay browser. Please try again.");
          await exitProcess(1);
        }
      } else {
        await exitProcess(0);
      }
    }

    await launchBrowser(url, { processGroupId });
  } catch (error) {
    if (error instanceof ProcessError) {
      const { errorLogPath, uploaded } = await reportBrowserCrash(error.stderr);

      console.log("\nSomething went wrong while recording. Try again.");
      console.log(dim(`\nMore information can be found in ${errorLogPath}`));
      if (uploaded) {
        console.log(dim(`The crash was reported to the Replay team`));
      }

      await exitProcess(1);
    }
  }

  const crashedRecordings: LocalRecording[] = [];
  const finishedRecordings: LocalRecording[] = [];
  const unusableRecordings: LocalRecording[] = [];

  getRecordings(processGroupId).forEach(recording => {
    switch (recording.recordingStatus) {
      case "crashed":
        if (canUpload(recording)) {
          crashedRecordings.push(recording);
        }
        break;
      case "unusable":
        unusableRecordings.push(recording);
        break;
      default:
        finishedRecordings.push(recording);
    }
  });

  console.log(""); // Spacing for readability

  // First check for any new crashes; these we should upload automatically
  if (crashedRecordings.length > 0) {
    console.log(
      "It looks like something went wrong while recording. Please hold while we upload crash data."
    );

    const promise = uploadRecordings(crashedRecordings, {
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
  } else if (unusableRecordings.length > 0) {
    // If there were unusable recordings we should provide explicit messaging about them
    const reason = getRecordingUnusableReason(processGroupId);
    if (reason) {
      console.log("An error occurred while recording:\n" + statusFailed(reason));
      console.log(""); // Spacing for readability
    }
  }

  trackEvent("record.results", {
    crashedCount: crashedRecordings.length,
    successCountsByType: finishedRecordings.reduce(
      (map, recording) => {
        const processType = recording.metadata.processType ?? "unknown";
        map[processType] ??= 0;
        map[processType]++;

        return map;
      },
      {
        devtools: 0,
        extension: 0,
        iframe: 0,
        root: 0,
        unknown: 0,
      }
    ),
  });

  // Then let the user decide what to do with the other new recordings
  if (finishedRecordings.length > 0) {
    if (!process.stdin.isTTY) {
      console.log(
        "New recording(s) found:\n" +
          printRecordings(finishedRecordings, {
            showHeaderRow: false,
          })
      );
    } else {
      let selectedRecordings: LocalRecording[] = [];
      if (finishedRecordings.length === 1) {
        const confirmed = await confirm(
          "New recording found. Would you like to upload it?",
          true,
          "\n" +
            printRecordings(finishedRecordings, {
              showHeaderRow: false,
            })
        );
        if (confirmed) {
          selectedRecordings = finishedRecordings;
        }

        console.log(""); // Spacing for readability
      } else {
        selectedRecordings = await selectRecordings(finishedRecordings, {
          defaultSelected: recording => recording.metadata.processType === "root",
          prompt: "New recordings found. Which would you like to upload?",
          selectionMessage: "The following recording(s) will be uploaded:",
        });
      }

      if (selectedRecordings.length > 0) {
        await uploadRecordings(selectedRecordings, { processingBehavior: "start-processing" });
      }
    }
  } else if (crashedRecordings.length === 0) {
    // It doesn't make sense to print this message if there were crashes
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
