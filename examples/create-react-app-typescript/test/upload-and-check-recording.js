const assert = require("assert");
const { WebSocket } = require("ws");
const { SimpleProtocolClient } = require("@replayio/protocol");
const replay = require("@replayio/replay");
const fetch = require("node-fetch");

(async () => {
  try {
    const apiKey = process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY;
    assert(apiKey, "Expected REPLAY_API_KEY to be set");
    const recordings = replay.listAllRecordings();
    assert(recordings.length === 1, `Expected 1 recording but found ${recordings.length}`);
    const recordingId = recordings[0].id;
    console.log(`Uploading recording ${recordingId}`);
    await replay.uploadRecording(recordingId, { apiKey });
    console.log("Checking metadata");
    const metadata = await getTestMetadata(recordingId, apiKey);
    assert(
      metadata?.test?.tests?.length > 0 && metadata.test.tests[0].events?.main?.length > 0,
      "No test events found in metadata"
    );
    console.log("Checking annotations");
    const annotationCount = await countAnnotations(recordingId, "replay-playwright", apiKey);
    assert(annotationCount > 0, "No annotations found");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

async function getTestMetadata(recordingId, apiKey) {
  const resp = await fetch("https://api.replay.io/v1/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: `
        query GetTestMetadata($recordingId: UUID!) {
          recording(uuid: $recordingId) {
            metadata
          }
        }
      `,
      variables: {
        recordingId,
      },
    }),
  });

  return (await resp.json()).data.recording.metadata;
}

async function countAnnotations(recordingId, kind, apiKey) {
  const client = new SimpleProtocolClient(
    new WebSocket("wss://dispatch.replay.io/"),
    { onClose: console.log, onError: console.log },
    console.log
  );
  await client.sendCommand("Authentication.setAccessToken", { accessToken: apiKey });
  const { sessionId } = await client.sendCommand("Recording.createSession", { recordingId });
  let count = 0;
  client.addEventListener("Session.annotations", ({ annotations }) => {
    count += annotations.length;
  });
  await client.sendCommand("Session.findAnnotations", { kind }, sessionId);
  return count;
}
