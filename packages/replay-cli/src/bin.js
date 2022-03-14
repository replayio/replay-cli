const { program } = require("commander");
const {
  listAllRecordings,
  uploadRecording,
  processRecording,
  uploadAllRecordings,
  viewRecording,
  viewLatestRecording,
  removeRecording,
  removeAllRecordings,
  updateBrowsers,
} = require("./main");

program
  .command("ls")
  .description("List information about all recordings.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandListAllRecordings);

program
  .command("upload <id>")
  .description("Upload a recording to the remote server.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandUploadRecording);

program
  .command("process <id>")
  .description("Upload a recording to the remote server and process it.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandProcessRecording);

program
  .command("upload-all")
  .description("Upload all recordings to the remote server.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandUploadAllRecordings);

program
  .command("view <id>")
  .description("Load the devtools on a recording, uploading it if needed.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandViewRecording);

program
  .command("view-latest")
  .description("Load the devtools on the latest recording, uploading it if needed.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .option(
    "--server <address>",
    "Alternate server to upload recordings to."
  )
  .option(
    "--api-key <key>",
    "Authentication API Key"
  )
  .action(commandViewLatestRecording);

program
  .command("rm <id>")
  .description("Remove a specific recording.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandRemoveRecording);

program
  .command("rm-all")
  .description("Remove all recordings.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandRemoveAllRecordings);

program
  .command("update-browsers")
  .description("Update browsers used in automation.")
  .option(
    "--directory <dir>",
    "Alternate recording directory."
  )
  .action(commandUpdateBrowsers);

program
  .parseAsync()
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });

function commandListAllRecordings(opts) {
  const recordings = listAllRecordings({ ...opts, verbose: true });
  console.log(JSON.stringify(recordings, null, 2));
  process.exit(0);
}

async function commandUploadRecording(id, opts) {
  const recordingId = await uploadRecording(id, { ...opts, verbose: true });
  process.exit(recordingId ? 0 : 1);
}

async function commandProcessRecording(id, opts) {
  const recordingId = await processRecording(id, { ...opts, verbose: true });
  process.exit(recordingId ? 0 : 1);
}

async function commandUploadAllRecordings(opts) {
  const uploadedAll = await uploadAllRecordings({ ...opts, verbose: true });
  process.exit(uploadedAll ? 0 : 1);
}

async function commandViewRecording(id, opts) {
  const viewed = await viewRecording(id, { ...opts, verbose: true });
  process.exit(viewed ? 0 : 1);
}

async function commandViewLatestRecording(opts) {
  const viewed = await viewLatestRecording({ ...opts, verbose: true });
  process.exit(viewed ? 0 : 1);
}

function commandRemoveRecording(id, opts) {
  const removed = removeRecording(id, { ...opts, verbose: true });
  process.exit(removed ? 0 : 1);
}

function commandRemoveAllRecordings(opts) {
  removeAllRecordings({ ...opts, verbose: true });
  process.exit(0);
}

async function commandUpdateBrowsers(opts) {
  await updateBrowsers({ ...opts, verbose: true });
  process.exit(0);
}
