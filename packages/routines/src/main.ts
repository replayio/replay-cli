#!/usr/bin/env node

import ProtocolClient from "./client";
import { defer, maybeLog } from "./utils";

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

let gClient: ProtocolClient | undefined;
let gClientReady = defer<boolean>();

// FIXME copied from packages/replay/src/main.ts
async function initConnection(
  server: string,
  accessToken?: string,
  verbose?: boolean
) {
  if (!gClient) {
    let { resolve } = gClientReady;
    gClient = new ProtocolClient(
      server,
      {
        async onOpen() {
          try {
            await gClient!.setAccessToken(accessToken);
            resolve(true);
          } catch (err) {
            maybeLog(verbose, `Error authenticating with server: ${err}`);
            resolve(false);
          }
        },
        onClose() {
          resolve(false);
        },
        onError(e) {
          maybeLog(verbose, `Error connecting to server: ${e}`);
          resolve(false);
        },
      }
    );
  }

  return gClientReady.promise;
}

async function main() {
  if (!gRecordingId) {
    showUsage(`Recording ID required`);
  }

  const connected = await initConnection(gServer, gAPIKey, true);
  if (!connected) {
    process.exit(1);
  }

  console.log("CONNECTED");
}

main();
