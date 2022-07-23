#!/usr/bin/env node

import ProtocolClient from "./client";
import { ensureProcessed } from "./process";
import { loadConsoleMessages } from "./consoleMessages";
import { assert, defer, log } from "./utils";

const Usage = `
Usage: replay-routine [options]
Options:
  --recording <recording-id>
  --server <server>
  --api-key <key>
`;

function showUsage(error?: string): never {
  if (error) {
    console.log(error);
  }
  console.log(Usage);
  process.exit(1);
}

let gRecordingId: string | undefined;
let gServer: string = "wss://dispatch.replay.io";
let gAPIKey: string | undefined;

for (let i = 2; i < process.argv.length; i++) {
  const option = process.argv[i];
  const arg = process.argv[++i];
  switch (option) {
    case "--recording":
      gRecordingId = arg;
      break;
    case "--server":
      gServer = arg;
      break;
    case "--api-key":
      gAPIKey = arg;
      break;
    default:
      showUsage(`Unknown option ${option}`);
      break;
  }
  if (!arg) {
    showUsage(`Option ${option} requires argument`);
  }
}

// FIXME common up with initConnection from packages/replay/src/main.ts
async function initConnection(server: string, accessToken?: string) {
  const clientReady = defer<boolean>();

  const client = new ProtocolClient(
    server,
    {
      async onOpen() {
        try {
          await client.setAccessToken(accessToken);
          clientReady.resolve(true);
        } catch (err) {
          log(`Error authenticating with server: ${err}`);
          clientReady.resolve(false);
        }
      },
      onClose() {
        clientReady.resolve(false);
      },
      onError(e) {
        log(`Error connecting to server: ${e}`);
        clientReady.resolve(false);
      },
    }
  );

  const connected = await clientReady.promise;
  return connected ? client : null;
}

async function main() {
  if (!gRecordingId) {
    showUsage(`Recording ID required`);
  }

  const client = await initConnection(gServer, gAPIKey);
  if (!client) {
    process.exit(1);
  }

  client.setEventListener("Recording.sessionError", e => {
    log(`Session error ${e}`);
  });

  client.setEventListener("Recording.uploadedData", () => {});
  client.setEventListener("Session.missingRegions", () => {});
  client.setEventListener("Session.unprocessedRegions", () => {});

  const hasLoadingRegions = defer<void>();
  client.setEventListener("Session.loadedRegions", ({ loaded, loading, indexed }) => {
    hasLoadingRegions.resolve();
  });

  const { sessionId } = await client.sendCommand("Recording.createSession", {
    recordingId: gRecordingId,
    experimentalSettings: {
      enableQueryCache: true,
    },
  });

  console.log("SessionId", sessionId);

  client.sendCommand("Session.listenForLoadChanges", {}, sessionId);

  await hasLoadingRegions.promise;

  await Promise.all([
    ensureProcessed(client, sessionId),
    loadConsoleMessages(client, sessionId),
  ]);

  console.log("Finished routines, exiting...");
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
