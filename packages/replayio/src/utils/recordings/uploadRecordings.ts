import { Deferred, STATUS_RESOLVED } from "@replay-cli/shared/async/createDeferred";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { disableAnimatedLog, replayAppHost } from "@replay-cli/shared/config";
import { logDebug } from "@replay-cli/shared/logger";
import { logUpdate } from "@replay-cli/shared/logUpdate";
import { createAsyncFunctionWithTracking } from "@replay-cli/shared/mixpanelClient";
import { printTable } from "@replay-cli/shared/printTable";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import {
  AUTHENTICATION_REQUIRED_ERROR_CODE,
  ProtocolError,
} from "@replay-cli/shared/protocol/ProtocolError";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { formatRecording } from "@replay-cli/shared/recording/formatRecording";
import type { LocalRecording } from "@replay-cli/shared/recording/types";
import type { ProcessingBehavior } from "@replay-cli/shared/recording/upload/types";
import { createUploadWorker } from "@replay-cli/shared/recording/upload/uploadWorker";
import {
  dim,
  highlight,
  link,
  statusFailed,
  statusPending,
  statusSuccess,
} from "@replay-cli/shared/theme";
import { dots } from "cli-spinners";
import assert from "node:assert/strict";
import strip from "strip-ansi";

async function printDeferredRecordingActions(
  deferredActions: Deferred<boolean, LocalRecording>[],
  {
    renderTitle,
    renderExtraColumns,
    renderFailedSummary,
  }: {
    renderTitle: (options: { done: boolean }) => string;
    renderExtraColumns: (recording: LocalRecording) => string[];
    renderFailedSummary: (failedRecordings: LocalRecording[]) => string;
  }
) {
  let dotIndex = 0;

  const print = (done = false) => {
    const dot = dots.frames[++dotIndex % dots.frames.length];
    const title = renderTitle({ done });
    const table = printTable({
      rows: deferredActions.map(deferred => {
        let status = disableAnimatedLog ? "" : statusPending(dot);
        if (deferred.resolution === true) {
          status = statusSuccess("✔");
        } else if (deferred.resolution === false) {
          status = statusFailed("✘");
        }
        const recording = deferred.data;
        const { date, duration, id, title } = formatRecording(recording);
        return [status, id, title, date, duration, ...renderExtraColumns(recording)];
      }),
    });

    logUpdate(title + "\n" + table);
  };

  print();

  const interval = disableAnimatedLog ? undefined : setInterval(print, dots.interval);

  await Promise.all(deferredActions.map(deferred => deferred.promise));

  clearInterval(interval);
  print(true);
  logUpdate.done();

  const failedActions = deferredActions.filter(deferred => deferred.status !== STATUS_RESOLVED);
  if (failedActions.length > 0) {
    const failedSummary = renderFailedSummary(failedActions.map(action => action.data));
    console.log(statusFailed(`${failedSummary}`) + "\n");
  }
}

function printViewRecordingLinks(recordings: LocalRecording[]) {
  switch (recordings.length) {
    case 0: {
      break;
    }
    case 1: {
      const recording = recordings[0];
      const url = `${replayAppHost}/recording/${recording.id}`;

      console.log("View recording at:");
      console.log(link(url));
      break;
    }
    default: {
      console.log("View recording(s) at:");

      for (const recording of recordings) {
        const { processType, title } = formatRecording(recording);

        const url = `${replayAppHost}/recording/${recording.id}`;

        const formatted = processType ? `${title} ${processType}` : title;

        let text = `${formatted}: ${link(url)}`;
        if (strip(text).length > process.stdout.columns) {
          text = `${formatted}:\n${link(url)}`;
        }

        console.log(text);
      }
      break;
    }
  }
}

export const uploadRecordings = createAsyncFunctionWithTracking(
  async function uploadRecordings(
    recordings: LocalRecording[],
    {
      silent = false,
      ...options
    }: {
      deleteOnSuccess?: boolean;
      processingBehavior: ProcessingBehavior;
      silent?: boolean;
    }
  ) {
    recordings = recordings.filter(recording => {
      if (!canUpload(recording)) {
        logDebug(`Cannot upload recording ${recording.id}`, { recording });
        return false;
      }

      return true;
    });

    if (recordings.length === 0) {
      return [];
    }

    const { accessToken } = await getAccessToken();
    assert(accessToken, "No access token found");
    const worker = createUploadWorker({ accessToken, ...options });
    const deferredActions = recordings.map(recording => worker.upload(recording));

    if (!silent) {
      printDeferredRecordingActions(deferredActions, {
        renderTitle: ({ done }) => (done ? "Uploaded recordings" : `Uploading recordings...`),
        renderExtraColumns: recording => {
          let status: string | undefined;
          if (recording.processingStatus) {
            switch (recording.processingStatus) {
              case "processing":
                status = "(processing…)";
                break;
              case "processed":
                status = "(uploaded+processed)";
                break;
            }
          } else {
            switch (recording.uploadStatus) {
              case "failed":
                status = "(failed)";
                break;
              case "uploading":
                status = "(uploading…)";
                break;
              case "uploaded":
                status = "(uploaded)";
                break;
            }
          }
          return [status ? dim(status) : ""];
        },
        renderFailedSummary: failedRecordings =>
          `${failedRecordings.length} recording(s) did not upload successfully`,
      });
    }

    try {
      recordings = await worker.end();
    } catch (error) {
      if (
        error instanceof ProtocolError &&
        error.protocolCode === AUTHENTICATION_REQUIRED_ERROR_CODE
      ) {
        let message = `${statusFailed("✘")} Authentication failed.`;
        if (process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY) {
          const name = process.env.REPLAY_API_KEY ? "REPLAY_API_KEY" : "RECORD_REPLAY_API_KEY";
          message += ` Please check your ${highlight(name)}.`;
        } else {
          message += ` Please try to ${highlight("replay login")} again.`;
        }
        console.error(message);
        await exitProcess(1);
      }
      throw error;
    }

    if (!silent) {
      const uploadedRecordings = recordings.filter(
        recording => recording.uploadStatus === "uploaded"
      );
      printViewRecordingLinks(uploadedRecordings);
    }

    return recordings;
  },
  "upload.results",
  recordings => {
    return {
      failedCount:
        recordings?.filter(recording => recording.uploadStatus !== "uploaded").length ?? 0,
      uploadedCount:
        recordings?.filter(recording => recording.uploadStatus === "uploaded").length ?? 0,
    };
  }
);
