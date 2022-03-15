async function uploadFailedRecordings({require}) {
  const cli = require("@replayio/replay");

  const allRecordings = cli.listAllRecordings();
  const failedRecordings = allRecordings.filter(
    (r) => r.metadata.testStatus === "failed"
  );

  console.log("Found", failedRecordings.length, " failed recordings of", allRecordings.length, "total recordings");

  const results = await Promise.allSettled(
    failedRecordings.map((r) => cli.uploadRecording(r.id, { verbose: true }))
  );

  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("Failed to upload replay:", r.reason);
    }
  });

  return cli
    .listAllRecordings()
    .filter((r) => r.status === "uploaded")
    .map((r) => ({ id: r.recordingId, title: r.metadata.title }));
}

module.exports = uploadFailedRecordings;
