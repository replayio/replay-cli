import debug from "debug";
import { writeFileSync } from "fs-extra";
import { v4 as uuid } from "uuid";
import { ProcessError } from "../utils/ProcessError";
import { logAsyncOperation } from "../utils/async/logAsyncOperation";
import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerCommand } from "../utils/commander/registerCommand";
import { confirm } from "../utils/confirm";
import { exitProcess } from "../utils/exitProcess";
import { getReplayPath } from "../utils/getReplayPath";
import { trackEvent } from "../utils/mixpanel/trackEvent";
import { canUpload } from "../utils/recordings/canUpload";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";
import { uploadRecordings } from "../utils/recordings/upload/uploadRecordings";
import { dim } from "../utils/theme";

registerCommand("record", { checkForRuntimeUpdate: true, requireAuthentication: true })
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Launch the replay browser in recording mode")
  .action(record)
  .allowUnknownOption();

async function record(url: string = "about:blank") {
  // This flag is intentionally not listed in the command options
  // but if specified, it will both enable "debug" logging and Replay Browser's "verbose" mode
  const verbose = process.argv.includes("--verbose");
  if (verbose) {
    debug.enable("replayio:browser");
  }

  const processGroupId = uuid();

  try {
    await launchBrowser(url, { processGroupId, verbose });
  } catch (error) {
    if (error instanceof ProcessError) {
      console.log("\nSomething went wrong while recording. Try again.");

      // TODO [PRO-235] Upload recorder crash data somewhere

      const { stderr } = error;
      if (stderr.length > 0) {
        const errorLogPath = getReplayPath("recorder-crash.log");

        writeFileSync(errorLogPath, stderr, "utf8");

        console.log(dim(`More information can be found in ${errorLogPath}`));
      }

      await exitProcess(1);
    }
  }

  const recordingsAfter = await getRecordings(processGroupId);

  const nextCrashedRecordings: LocalRecording[] = [];
  const nextRecordings: LocalRecording[] = [];

  recordingsAfter.filter(recording => {
    if (recording.recordingStatus === "crashed") {
      if (canUpload(recording)) {
        nextCrashedRecordings.push(recording);
      }
    } else {
      nextRecordings.push(recording);
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

  trackEvent("record.results", {
    crashedCount: nextCrashedRecordings.length,
    successCountsByType: nextRecordings.reduce(
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
  if (nextRecordings.length > 0) {
    if (!process.stdin.isTTY) {
      console.log(
        "New recording(s) found:\n" +
          printRecordings(nextRecordings, {
            showHeaderRow: false,
          })
      );
    } else {
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
        selectedRecordings = await selectRecordings(nextRecordings, {
          defaultSelected: recording => recording.metadata.processType === "root",
          prompt: "New recordings found. Which would you like to upload?",
          selectionMessage: "The following recording(s) will be uploaded:",
        });
      }

      if (selectedRecordings.length > 0) {
        await uploadRecordings(selectedRecordings, { processingBehavior: "start-processing" });
      }
    }
  } else if (nextCrashedRecordings.length === 0) {
    // It doesn't make sense to print this message if there were crashes
    console.log("No new recordings were created");
  }

  await exitProcess(0);
}
