const cli = require("@replayio/replay")

async function uploadFailedRecordings() {
  // const recordings = cli
  //   .listAllRecordings()
  //   .filter((r) => r.metadata.testStatus === 'failed');

  // const recordingIds = await Promise.all(recordings.map(r => cli.uploadRecording(r.id, {verbose: true})));
  // return recordingIds.join(",");

  // TODO: Temporarily upload everything until the CLI is updated
  await cli.uploadAllRecordings({verbose: true});

  return cli
    .listAllRecordings()
    .filter((r) => r.status === 'uploaded')
    .map(r => ({id: r.recordingId, title: r.metadata.title}));
}

module.exports = uploadFailedRecordings;
