import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { printRecordings } from "@replay-cli/shared/recording/printRecordings";
import { registerCommand } from "../utils/commander/registerCommand";

registerCommand("list")
  .description("List all local recordings")
  .option("--json", "Format output as JSON")
  .action(list);

async function list({ json = false }: { json?: boolean }) {
  const recordings = getRecordings();

  if (json) {
    console.log(JSON.stringify(recordings, null, 2));
  } else if (recordings.length === 0) {
    console.log("No recordings found");
  } else {
    console.log(printRecordings(recordings));
  }

  await exitProcess(0);
}
