import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { findRecordingsWithShortIds } from "@replay-cli/shared/recording/findRecordingsWithShortIds";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { printRecordings } from "@replay-cli/shared/recording/printRecordings";
import { removeAllFromDisk, removeFromDisk } from "@replay-cli/shared/recording/removeFromDisk";
import { selectRecordings } from "@replay-cli/shared/recording/selectRecordings";
import { LocalRecording } from "@replay-cli/shared/recording/types";
import { dim } from "@replay-cli/shared/theme";
import { registerCommand } from "../utils/commander/registerCommand";

registerCommand("remove")
  .argument("[ids...]", `Recording ids ${dim("(comma-separated)")}`, value => value.split(","))
  .option("-a, --all", "Remove all recordings")
  .description("Delete one or more recordings from disk")
  .action(remove);

async function remove(shortIds: string[], { all = false }: { all?: boolean }) {
  if (all) {
    removeAllFromDisk();
    console.log("All recordings deleted");
    await exitProcess(0);
  }

  const allRecordings = getRecordings();

  if (allRecordings.length === 0) {
    console.log("No recordings found");
  } else {
    const countBefore = allRecordings.length;

    let selectedRecordings: LocalRecording[] = [];
    if (shortIds.length > 0) {
      selectedRecordings = findRecordingsWithShortIds(allRecordings, shortIds);
    } else {
      if (!process.stdin.isTTY) {
        console.log("Recording ids argument required for non-TTY environments.");

        await exitProcess(1);
      }

      selectedRecordings = await selectRecordings(allRecordings, {
        prompt: "Which recordings would you like to delete?",
        selectionMessage: "The following recording(s) will be deleted from disk:",
      });
    }

    if (selectedRecordings.length === 0) {
      console.log("No recordings selected");
    } else {
      console.log("Deleting the following recording(s)");
      console.log(printRecordings(selectedRecordings, { showHeaderRow: false }));

      for (const recording of selectedRecordings) {
        removeFromDisk(recording.id);
      }

      const countAfter = getRecordings().length;

      if (countAfter < countBefore) {
        console.log("%s recording(s) deleted", countBefore - countAfter);
      } else {
        console.log("No recordings deleted");
      }
    }
  }

  await exitProcess(0);
}
