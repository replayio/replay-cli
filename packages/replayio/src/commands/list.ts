import { registerCommand } from "../utils/commander/registerCommand.js";
import { exitProcess } from "../utils/exitProcess.js";
import { getRecordings } from "../utils/recordings/getRecordings.js";
import { printRecordings } from "../utils/recordings/printRecordings.js";

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
