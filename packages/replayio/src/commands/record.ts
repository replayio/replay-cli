import { ProcessError } from "@replay-cli/shared/ProcessError";
import { logError } from "@replay-cli/shared/logger";
import { trackEvent } from "@replay-cli/shared/mixpanelClient";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { printRecordings } from "@replay-cli/shared/recording/printRecordings";
import { selectRecordings } from "@replay-cli/shared/recording/selectRecordings";
import { LocalRecording } from "@replay-cli/shared/recording/types";
import { dim, statusFailed } from "@replay-cli/shared/theme";
import debug from "debug";
import { v4 as uuid } from "uuid";
import { logAsyncOperation } from "../utils/async/logAsyncOperation";
import { killBrowserIfRunning } from "../utils/browser/killBrowserIfRunning";
import { launchBrowser } from "../utils/browser/launchBrowser";
import { reportBrowserCrash } from "../utils/browser/reportBrowserCrash";
import { registerCommand } from "../utils/commander/registerCommand";
import { confirm } from "../utils/confirm";
import { uploadRecordings } from "../utils/recordings/uploadRecordings";

registerCommand("record", { checkForRuntimeUpdate: true, requireAuthentication: true })
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Launch the replay browser in recording mode")
  .action(record)
  .allowUnknownOption();

async function record(url: string = "about:blank") {
  // this flag is intentionally not listed in the command options
  const verbose = process.argv.includes("--verbose");
  if (verbose) {
    debug.enable("replay");
  }

  const processGroupId = uuid();

  try {
    await killBrowserIfRunning();

    await launchBrowser(url, { processGroupId });
  } catch (error) {
    if (error instanceof ProcessError) {
      logError("Record:BrowserCrash", { error: error.stderr });
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
    const reason = unusableRecordings.findLast(
      recording => recording.unusableReason
    )?.unusableReason;
    console.log("An error occurred while recording:\n" + statusFailed(reason ?? "Internal"));
    console.log(""); // Spacing for readability
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
