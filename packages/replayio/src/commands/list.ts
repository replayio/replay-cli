import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";
import { getRecordings } from "../utils/recordings/getRecordings";
import { printRecordings } from "../utils/recordings/printRecordings";

registerCommand("list", { requireAuthentication: true })
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
