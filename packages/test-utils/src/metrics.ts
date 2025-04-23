import { logError, logInfo } from "@replay-cli/shared/logger";
import { TestMetadataV2 } from "@replay-cli/shared/recording/metadata/legacy/test/v2";
import fetch from "node-fetch";
import os from "node:os";

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
  logInfo("PingTestMetrics:Started");

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

  logInfo("PingTestMetrics", { body });

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  fetch(`${webhookUrl}/api/metrics`, {
    method: "POST",
    headers,
    body,
  })
    .then(() => logInfo("PingTestMetrics:Succeeded"))
    .catch(error => logError("PingTestMetrics:Failed", { body, error }));
}

export { pingTestMetrics };
