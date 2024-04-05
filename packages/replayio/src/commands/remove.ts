import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { getRecordings } from "../utils/recordings/getRecordings";
import { removeFromDisk } from "../utils/recordings/removeFromDisk";

registerCommand("remove [id]")
  .option("--all", "Remove all recordings")
  .description("Delete one or more recordings from disk")
  .action(remove);

async function remove(id: string | undefined, { all = false }: { all?: boolean }) {
  if (id == null && all == false) {
    console.log(
      "Please specify a recording ID or use the --all flag to remove all recordings from disk."
    );

    await exitProcess(1);
  }

  const countBefore = (await getRecordings()).length;

  await removeFromDisk(id);

  const countAfter = (await getRecordings()).length;

  if (countAfter < countBefore) {
    console.log("%s recording(s) removed", countBefore - countAfter);
  } else {
    console.log("No recordings removed");
  }

  await exitProcess(0);
}
