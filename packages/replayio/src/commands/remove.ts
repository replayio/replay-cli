import chalk from "chalk";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { findRecordingsWithShortIds } from "../utils/recordings/findRecordingsWithShortIds";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";
import { removeFromDisk } from "../utils/recordings/removeFromDisk";
import { selectRecordings } from "../utils/recordings/selectRecordings";
import { LocalRecording } from "../utils/recordings/types";

registerCommand("remove")
  .argument("[ids...]", `Recording ids ${chalk.gray("(comma-separated)")}`, value =>
    value.split(",")
  )
  .option("-a, --all", "Remove all recordings")
  .description("Delete one or more recordings from disk")
  .action(remove);

async function remove(shortIds: string[], { all = false }: { all?: boolean }) {
  const allRecordings = await getRecordings();

  if (allRecordings.length === 0) {
    console.log("No recordings found");
  } else {
    const countBefore = allRecordings.length;

    let selectedRecordings: LocalRecording[] = [];
    if (shortIds.length > 0) {
      selectedRecordings = findRecordingsWithShortIds(allRecordings, shortIds);
    } else if (all) {
      selectedRecordings = allRecordings;
    } else {
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
        await removeFromDisk(recording.id);
      }

      const countAfter = (await getRecordings()).length;

      if (countAfter < countBefore) {
        console.log("%s recording(s) deleted", countBefore - countAfter);
      } else {
        console.log("No recordings deleted");
      }
    }
  }

  await exitProcess(0);
}
