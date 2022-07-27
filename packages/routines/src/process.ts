// Routine to ensure that a recording can be entirely replayed, and ensure that data cached in the
// backend after basic processing is available.

import ProtocolClient from "./client";

// Data source which can be used by clients to see if the recording was successfully processed.
const ProcessedDataSource = {
  name: "EnsureProcessed",
  version: "1.0",
};

export async function ensureProcessed(client: ProtocolClient, sessionId: string) {
  console.log("StartEnsureProcessed");

  // Whether this recording has already been marked as fully processed.
  let hasProcessedData = false;

  client.setEventListener("Storage.newData", ({ source, data }) => {
    if (
      source.name == ProcessedDataSource.name &&
      source.version == ProcessedDataSource.version &&
      data.success
    ) {
      hasProcessedData = true;
    }
  });

  try {
    // @ts-ignore
    const { finished } = await client.sendCommand(
      // @ts-ignore
      "Storage.getData",
      { source: ProcessedDataSource },
      sessionId
    );
    if (finished && hasProcessedData) {
      console.log("AlreadyProcessed");
      return;
    }
  } catch (e) {
    // An error will be returned for unknown data sources.
  }

  // @ts-ignore
  await client.sendCommand("Storage.startData", { source: ProcessedDataSource }, sessionId);

  await client.sendCommand(
    "Session.ensureProcessed",
    {
      level: "basic",
    },
    sessionId
  );

  await client.sendCommand(
    // @ts-ignore
    "Storage.addData",
    { source: ProcessedDataSource, data: { success: true } },
    sessionId
  );

  // @ts-ignore
  await client.sendCommand("Storage.finishData", { source: ProcessedDataSource }, sessionId);

  console.log("ProcessingFinished");
}
