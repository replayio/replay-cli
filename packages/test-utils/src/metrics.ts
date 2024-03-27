import dbg from "debug";
import os from "os";
import fetch from "node-fetch";
import { TestMetadataV2 } from "@kitchensink-replayio/replay/metadata/test/v2";
import { warn } from "./logging";

const debug = dbg("replay:test-utils:metrics");

function shouldReportTestMetrics() {
  const optOut = process.env.RECORD_REPLAY_TEST_METRICS?.toLowerCase();

  return !optOut || !(optOut === "0" || optOut === "false");
}

async function pingTestMetrics(
  recordingId: string | undefined,
  runId: string,
  test: {
    id: string;
    approximateDuration: number;
    recorded: boolean;
    source: TestMetadataV2.TestRun["source"];
    runtime?: string;
    runner?: string;
    result?: string;
  },
  apiKey?: string
) {
  if (!shouldReportTestMetrics()) return;

  const webhookUrl = process.env.RECORD_REPLAY_WEBHOOK_URL || "https://webhooks.replay.io";

  const body = JSON.stringify({
    type: "test.finished",
    recordingId,
    test: {
      ...test,
      platform: os.platform(),
      runId,
      env: {
        disableAsserts: !!process.env.RECORD_REPLAY_DISABLE_ASSERTS,
        disableSourcemapCollection: !!process.env.RECORD_REPLAY_DISABLE_SOURCEMAP_COLLECTION,
        disableFeatures: process.env.RECORD_REPLAY_DISABLE_FEATURES || "none",
      },
    },
  });

  debug(body);

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    return await fetch(`${webhookUrl}/api/metrics`, {
      method: "POST",
      headers,
      body,
    });
  } catch (e) {
    warn("Failed to send test metrics", e);
  }
}

export { pingTestMetrics };
