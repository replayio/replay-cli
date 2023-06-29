import os from "os";
import fetch from "node-fetch";

function shouldReportTestMetrics() {
  const optOut = process.env.RECORD_REPLAY_TEST_METRICS?.toLowerCase();

  return !optOut || !(optOut === "0" || optOut === "false");
}

async function pingTestMetrics(
  recordingId: string | undefined,
  runId: string,
  test: {
    id: string;
    duration: number;
    recorded: boolean;
    source: {
      title: string;
      scope: string[];
    };
    runtime?: string;
    runner?: string;
    result?: string;
  }
) {
  if (!shouldReportTestMetrics()) return;

  const webhookUrl = process.env.RECORD_REPLAY_WEBHOOK_URL || "https://webhooks.replay.io";

  try {
    return await fetch(`${webhookUrl}/api/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "test.finished",
        recordingId,
        test: {
          ...test,
          platform: os.platform,
          runId,
          env: {
            disableAsserts: !!process.env.RECORD_REPLAY_DISABLE_ASSERTS,
            disableSourcemapCollection: !!process.env.RECORD_REPLAY_DISABLE_SOURCEMAP_COLLECTION,
            disableFeatures: process.env.RECORD_REPLAY_DISABLE_FEATURES || "none",
          },
        },
      }),
    });
  } catch (e) {
    console.log("Failed to send test metrics", e);
  }
}

export { pingTestMetrics };
